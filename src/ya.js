define([], function () {

  'use strict';

  // In ES6, symbols are special objects that can be used to index other
  // objects. As they are private to function scope, they become something
  // like privates.

  /* jshint newcap: false */
  var id = Symbol();
  var isReady = Symbol();
  var isBlockedOnSelect = Symbol();
  var trySelect = Symbol();
  var result = Symbol();
  var routineCanBeRescheduled = Symbol();
  var canProceed = Symbol();
  /* jshint newcap: true */

  // The list of alive coroutines to be executed is ketp on a list.
  var coroutines = [];
  var nextTaskId = 1;

  // This flag indicates if clear() method has been called. It's needed to
  // abort execution from inside a routine.
  var clearCalled;

  // ya() function simply initializes the generator, then push it at the end of
  // the coroutines list and start running them if the list is not empty.
  function ya(generator) {
    var args = [].slice.call(arguments, 1);
    var task = generator.apply(undefined, args);
    task[isReady] = true;
    task[result] = undefined;
    task[id] = nextTaskId++;
    coroutines.push(task);
    (coroutines.length === 1) && setTimeout(run);
    return task[id];
  }

  // Run pìcks the last coroutine, execute it to the next yield and reschedule
  // the routine.
  function run() {
    clearCalled = false;

    // If there is no more coroutines, simply return without scheduling
    // another run.
    if (coroutines.length === 0) { return; }

    // If there are coroutines, pick the last one. Default reschedule of the
    // task consists into adding at the beginning.
    var execution, done, promise,
        scheduleOperation = 'unshift',
        routine = coroutines.pop();

    if (routine[isReady]) {

      // Advances the routine to the next yield, return or error.
      execution = runRoutine(routine);

      // If clear has been called inside the execution of the coroutine, abort
      // further execution and rescheduling.
      if (clearCalled) { return; }

      done = execution.done;
      promise = execution.value;

      // If the routine is over, don't reschedule.
      if (done) {
        scheduleOperation = null;
      }

      // When routine is not finished and it is returning a promise-like object,
      // it means the routine is waiting for the result of that promise.
      else if (promise && typeof promise.then === 'function') {

        // The routine is marked as blocked to prevent the scheduler from
        // running it.
        routine[isReady] = false;

        // And a fulfill callback is added to unblock the routine
        // while saving the computation result for using when resuming the
        // routine.
        promise.then(function (data) {
          routine[isReady] = true;
          routine[result] = data;
        });

        // Some promises can ensure they will be resolved for the next run
        // allowing the scheduler to reschedule the current routine immediately.
        if (promise[routineCanBeRescheduled]) {
          scheduleOperation = 'push';
        }

        // Copy runtime information to the routine.
        routine[isBlockedOnSelect] = promise[isBlockedOnSelect];
        routine[trySelect] = promise[trySelect];
      }
    }

    // If routine is not ready but it's blocking on a select, try the select
    // again.
    else if (routine[isBlockedOnSelect]) {
      var routineCanBeResumed = routine[trySelect]();
      if (routineCanBeResumed) {
        scheduleOperation = 'push';
      }
    }

    // Reschedule the routine.
    if (scheduleOperation) {
      coroutines[scheduleOperation](routine);
    }

    // And schedule another run.
    setTimeout(run);
  }

  // The function is isolated to minimize the impact of the try-catch.
  function runRoutine(routine) {
    var lastResult, execution, executionError;

    // Runs a single routine passing the channel promise's result from the last
    // run. In case of blocking on channel's operations, the result will be
    // sent values for get() operations or `undefined` for send() operations.
    try {
      lastResult = routine[result];
      routine[result] = undefined;
      execution = routine.next(lastResult);
    }

    // If there is an error during the execution, the task is aborted and the
    // onerror callback is called with an error object with the task id and the
    // real error.
    catch (e) {
      if (typeof ya.onerror === 'function') {
        executionError = { taskId: routine[id], error: e };
        ya.onerror(executionError);
      }
      // A fake execution is crafted to terminate the execution of the failing
      // routine.
      execution = { done: true };
    }

    return execution;
  }

  // The channel function returns a new channel object to be used to communicate
  // between coroutines. When coroutines send values and there are no consumers
  // the sender blocks. The same happens for coroutines getting values when
  // there are no values to be consumed.
  //
  // If a capacity is passed to the channel, then the channel is said to be
  // buffered and it won't block senders until completely filled. The capacity
  // value means how many unattended send() calls are allowed before blocking.
  //
  // For instance a 3 buffered channel will block a coroutine if this is
  // sending the fourth item or greater.
  function channel(capacity) {

    // An unbuffered channel does not allow any unattended item. Each send()
    // call will block unless there is a getter waiting for the value.
    capacity = capacity || 0;

    // When a value is sent to the channel but there is no one asking for that
    // value, we promise the sender that someone will retrieve the value and we
    // add a the promise resolver and the sent value to this collection.
    var toBeRetrievedPromises = [];

    // When a value is requested from the channel but there is no data available
    // we promise the getter that someone will send a value to be consumed and
    // we add the resolver for that promise.
    var toBeFilledPromises = [];

    // The channel object consists in two methods: get() and send().
    var channelInterface = {
      // get() is for retrieving values from the channel.
      get: function get() {
        var promiseForTheGetter;

        // First check if there are values to be consumed. If so, there will be
        // promises' resolvers in addition to the values being sent.
        if (toBeRetrievedPromises.length > 0) {

          // Each promise entry consists on a value and the resolver to tell
          // the sender that its value is about to be consumed and it will
          // be unblocked.
          var resolver, value,
              entry = toBeRetrievedPromises.shift();

          resolver = entry.resolver;
          value = entry.value;

          // Unblocks the sender! But notice it won't be executed until run
          // will be called again.
          //
          // The check about existence of the resolver is needed as buffered
          // channels may not require to always warn senders.
          resolver && resolver();

          // As the collection of unattended items has shifted, it's possible
          // for a blocked routine to have entered into the buffered section
          // of the channel. If so, the routine can be unblocked.
          if (capacity > 0 &&
              toBeRetrievedPromises.length >= capacity) {
            resolver = toBeRetrievedPromises[capacity - 1].resolver;
            toBeRetrievedPromises[capacity - 1].resolver = null;
            resolver && resolver();
          }

          // We will return an already solved promise to the getter with the
          // value to be consumed.
          promiseForTheGetter = Promise.resolve(value);

          // The scheduler is informed it can reschedule the coroutine
          // immediately.
          promiseForTheGetter[routineCanBeRescheduled] = true;
        }

        // In the other hand, if there are no values to be consumed, we make
        // a promise and leave the resolver as a way for the getter to be
        // notified when a value is available.
        else {
          promiseForTheGetter = new Promise(function (resolver) {
            toBeFilledPromises.push({ resolver: resolver });
          });
        }

        return promiseForTheGetter;
      },

      // send() is for sending values to the channel.
      send: function send(value) {
        var promiseForTheSender;

        // First check if there are petitioners waiting to be provided with
        // values for consuming.
        if (toBeFilledPromises.length > 0) {

          // Each entry simply consists in a resolver to notify the getter with
          // the sending value.
          var resolver = toBeFilledPromises.shift().resolver;

          // Unblocks the getter! And again, it won't be executed until the
          // next run.
          resolver(value);

          // We will return an already resolved promise to the sender saying
          // its value has been consumed immediately.
          promiseForTheSender = Promise.resolve();

          // And again, the promise will inform the scheduler it can
          // reschedule the routine immediately.
          promiseForTheSender[routineCanBeRescheduled] = true;
        }

        // If there are no petitioners waiting for values, promise the sender
        // its value will be consumed by enqueuing a pair of promise resolver
        // and the value to be consumed.
        else {

          var isFull = toBeRetrievedPromises.length >= capacity;

          // If the buffer is not full, the promise can be fulfilled and the
          // routine can be immediately resumed.
          if (!isFull) {
            promiseForTheSender = Promise.resolve();
            toBeRetrievedPromises.push({ resolver: null, value: value });
            promiseForTheSender[routineCanBeRescheduled] = true;
          }

          // But if it's full, then the promise remains and the sender will
          // block until someone consumes the value.
          else {
            promiseForTheSender = new Promise(function (resolver) {
              toBeRetrievedPromises.push({ resolver: resolver, value: value });
            });
          }
        }

        return promiseForTheSender;
      }
    };

    // This is a private method implemented through the use of a symbol.
    // The `channel#canProceed()` method return `true` if the channel is ready
    // to send or get a value without blocking the routine. It is equivalent
    // to check if the returning promise will have the `routineCanBeRescheduled`
    // set.
    channelInterface[canProceed] = function (type) {

      // A channel is ready for a `get` operation if there are waiting
      // producers.
      if (type === 'get') {
        return toBeRetrievedPromises.length > 0;
      }

      // A channel is ready for a `send` operation if there are waiting
      // consumers or if the channel is not yet full.
      else if (type === 'send') {
        return toBeFilledPromises.length > 0 ||
               toBeRetrievedPromises.length < capacity;
      }

      // Throw if the operation is not recognized.
      else {
        throw new Error('Channel operation unknown');
      }
    };
    return channelInterface;
  }

  // Select implements https://golang.org/ref/spec#Select_statements
  // Read it first, it's eeeeeasy (or read the API docs).
  function select() {
    var selectPromise, resolveSelectPromise;

    // Obtain clauses classified by nature.
    var classifiedClauses = classifyClauses([].slice.call(arguments, 0));
    var defaultClause = classifiedClauses.defaultClause;
    var caseClauses = classifiedClauses.caseClauses;

    // Now look for a ready case clause, i. e. a case clause with a channel
    // ready for the specified operation.
    var readyCase = chooseReadyCase(caseClauses);

    // If there is one, perform the channel operation and attach the clause
    // callback.
    if (readyCase) {
      selectPromise = readyCase.doChannelOperation();
      selectPromise.then(readyCase.callback);
    }

    // If not but there is a default clause, perform the default callback.
    else if (defaultClause) {
      selectPromise = Promise.resolve();
      selectPromise.then(defaultClause.callback);
      selectPromise[routineCanBeRescheduled] = true;
    }

    // If there is no ready channel and there is no default, block.
    else {
      selectPromise = new Promise(function (resolve) {
        resolveSelectPromise = resolve;
      });

      // As `routineCanBeRescheduled` this is more execution information. It
      // informs the routine is blocked on a `select` and provide a method to
      // recheck channel readyness.
      // TODO: Find a way to pass the execution information separately.
      selectPromise[isBlockedOnSelect] = true;
      selectPromise[trySelect] = _trySelect;
    }
    return selectPromise;

    // The function selects a ready case clause. A ready case is that whose
    // channel operation can be performed.
    function chooseReadyCase(cases) {
      var choosen = null;
      var readyClauses = [];
      cases.forEach(function (caseClause) {
        var channelCanProceed = caseClause.channel[canProceed](caseClause.type);
        if (channelCanProceed) {
          readyClauses.push(caseClause);
        }
      });

      // If there are more than one, select one randomly.
      if (readyClauses.length) {
        var randomIndex = Math.floor(Math.random() * readyClauses.length);
        choosen = readyClauses[randomIndex];
      }

      return choosen;
    }

    // The function re-check the select returning `true` if the select could
    // choose some ready channel or not. It's equivalent to foresee if the
    // returning promise from the channel operation will carry the
    // `routineCanBeRescheduled` flag set to `true`.
    function _trySelect() {

      // Choose one clause.
      var readyClause = chooseReadyCase(caseClauses);

      // If there are no ready channels...
      if (!readyClause) {
        return false;
      }

      // If there are, associate the returned select promise with the channel
      // one and carry the `routineCanBeRescheduled` flag.
      else {
        var channelPromise = readyClause.doChannelOperation();
        channelPromise.then(function (value) { resolveSelectPromise(value); });
        selectPromise.then(readyClause.callback);
        selectPromise[routineCanBeRescheduled] =
          channelPromise[routineCanBeRescheduled];
        return selectPromise[routineCanBeRescheduled];
      }
    }
  }

  // Pass through a collection of clauses and classify them into **case** and
  // **default** clause. Only one **dafeault** clause is allowed.
  function classifyClauses(clauses) {
    var defaultClause, caseClauses = [];
    clauses.forEach(function (clause) {
      if (clause instanceof DefaultClause && !defaultClause) {
        defaultClause = clause;
      }

      // Throw if more than one **default** clause is found.
      else if (clause instanceof DefaultClause) {
        throw new Error('Two default clauses in the same select.');
      }

      else {
        caseClauses.push(clause);
      }
    });

    return {
      defaultClause: defaultClause,
      caseClauses: caseClauses
    };
  }

  // The **case** factory returns a `CaseClause` instance.
  // TODO: Refactor to use a future `CaseClause` class.
  function $case(type) {
    var caseClause = { type: type };
    if (type === 'get' || type === '<-') {
      caseClause.type = 'get';
      caseClause.channel = arguments[1];
      caseClause.callback = arguments[2];
    }
    else if (type === 'send' || type === '->') {
      caseClause.type = 'send';
      caseClause.sendingValue = arguments[1];
      caseClause.channel = arguments[2];
      caseClause.callback = arguments[3];
    }
    else {
      throw new Error('Unknown channel operation.');
    }
    caseClause.doChannelOperation = function () {
      return caseClause.channel[caseClause.type](caseClause.sendingValue);
    };
    return caseClause;
  }

  // The **default** factory returns a `DefaultClause` instance.
  function $default(callback) {
    return new DefaultClause(callback);
  }

  // The `DefaultClause` instance holds no mistiries inside.
  function DefaultClause(callback) {
    this.callback = callback;
  }

  // The `clear()` method empties the coroutines list avoiding run to executed
  // and stablishes the `clearCalled` flag to be checked in those cases
  // `clear()` is called from inside a routine.
  function clear() {
    coroutines = [];
    clearCalled = true;
  }

  // Assemble the module and publish.
  var yaInterface = {
    channel: channel,
    clear: clear,
    select: select,
    $case: $case,
    $default: $default
  };
  for (var method in yaInterface) {
    if (yaInterface.hasOwnProperty(method)) {
      ya[method] = yaInterface[method];
    }
  }
  return ya;
});
