(function (root, factory) {
    var old_ya, lib_ya;
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        old_ya = root.ya;
        lib_ya = factory();
        root.ya = lib_ya;
        root.ya.restore = function () {
          root.ya = old_ya;
          return lib_ya;
        };
    }
}(this, function () {
'use strict';

var objects = {};

function define(name, dependencies, factory) {
  var args = gatherDependencies(dependencies);
  var newObject = factory.apply(void 0, args);
  objects[normalize(name)] = newObject;
}

function gatherDependencies(dependencies) {
  return dependencies.map(function (dependencyName) {
    return objects[normalize(dependencyName)];
  });
}

function normalize(name) {
  if (name.indexOf('./') === 0) {
    return name.substring(2);
  }
  return name;
}



// We use a named requirejs module since the optimizer does not work with
// ES6.
define('ya', [], function () {

  'use strict';

  // In ES6, symbols are special objects that can be used to index other
  // objects. As they are private to function scope, they become something
  // like privates.
  var isChannelPromise = Symbol();
  var isWaitingForChannel = Symbol();
  var promiseValue = Symbol();

  // The list of alive coroutines to be executed is ketp on a circular list.
  var coroutines = [];

  // ya() function simply initializes the generator, then push it at the end of
  // the coroutines list and start running them if the list is not empty.
  function ya(generator, ...args) {
    var task = generator(...args);
    coroutines.push(task);
    (coroutines.length === 1) && run();
  }

  // Run pìcks the latest coroutine, execute it to the next yield and add
  // it at the beginning of the list.
  function run() {

    // If there is no more coroutines, simply return without scheduling
    // another run.
    if (coroutines.length === 0) { return; }

    // If there are coroutines, pick the latest one.
    var routine = coroutines.pop();

    // If it's not waiting for the channel, let's run it.
    if (!routine[isWaitingForChannel]) {

      // Run the coroutine passing the channel promise value from the last run.
      // Promise value will be undefined for send() promises or the proper
      // sent-to-the-channel value for get() promises.
      var nextValue = routine[promiseValue];
      var { value, done } = routine.next(nextValue);

      // If the routine is not finished, enqueue again.
      if (!done) {
        coroutines.unshift(routine);

        // Now check what is the routine yielding. If it is a channel promise,
        // mark the routine as waiting to prevent it from being executed next
        // time.
        if (value && value[isChannelPromise]) {
          routine[isWaitingForChannel] = true;

          // Finally add a callback to the channel promise to allow the
          // coroutine to be unblocked when a value is available through the
          // channel.
          value.then((result) => {
            routine[isWaitingForChannel] = false;
            routine[promiseValue] = result;
          });
        }
      }
    }

    // Reschedule another run.
    setTimeout(run);
  }

  // The channel function returns a new channel object to be used to communicate
  // between coroutines.
  function channel() {

    // When a value is sent to the channel but there is no one asking for that
    // value, we promise the sender that someone will retrieve the value and we
    // add a the promise resolver and the sent value to this field.
    var toBeRetrievedPromises = [];

    // When a value is requested from the channel but there is no data available
    // we promise the getter that someone will send a value to be consumed and
    // we add the resolver for that promise.
    var toBeFilledPromises = [];

    // The channel object consist in two methods: get() and send().
    return {
      // get() is for retrieving values from the channel.
      get: function get() {

        // First check if there are values to be consumed. If so, there will be
        // promises' resolvers in addition to the values being sent.
        var promiseForTheGetter;
        if (toBeRetrievedPromises.length > 0) {

          // Each promise entry consists on a value and the resolver to tell
          // the sender that its value is about to be consumed and it will
          // be unblocked.
          var { resolver, value } = toBeRetrievedPromises.shift();

          // Unblocks the sender! But notice it won't be executed until run
          // will be called again.
          resolver();

          // We will return an already solved promise to the getter with the
          // value to be consumed.
          promiseForTheGetter = Promise.resolve(value);
        }

        // In the other hand, if there are no values to be consumed, we make
        // a promise and leave the resolver as a way to be warned when a value
        // is available.
        else {
          promiseForTheGetter = new Promise(function (resolver) {
            toBeFilledPromises.push({ resolver: resolver });
          });
        }

        // We mark channel promises before returning them.
        promiseForTheGetter[isChannelPromise] = true;
        return promiseForTheGetter;
      },

      // send() is for sending values to the channel.
      send: function send(value) {
        var promiseForTheSender;

        // First check if there are petitioners waiting to be provided with
        // values for consuming.
        if (toBeFilledPromises.length > 0) {

          // Each entry simply consists in a resolver to pass the getter the
          // sending value.
          var { resolver } = toBeFilledPromises.shift();

          // Unblocks the getter! And again, it won't be executed until the
          // next run.
          resolver(value);

          // We will return an already resolved promise to the sender saying
          // its value has been consumed immediately.
          promiseForTheSender = Promise.resolve();
        }

        // If there are no petitioners waiting for values, promise the sender
        // its value will be consumed by enqueuing a pair promise resolver and
        // the to-be-sent value.
        else {
          promiseForTheSender = new Promise(function (resolver) {
            toBeRetrievedPromises.push({ resolver: resolver, value: value });
          });
        }

        // Again, mark the promise and return.
        promiseForTheSender[isChannelPromise] = true;
        return promiseForTheSender;
      }
    };
  }

  ya.channel = channel;

  return ya;
});


return objects['ya'];

}));

//# sourceMappingURL=ya.js.map
