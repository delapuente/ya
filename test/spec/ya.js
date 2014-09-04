define([], function () {
  'use strict';

  var context = newContext();

  describe('src/ya', function () {

    var ya;
    var checkpoint = sinon.spy();

    beforeEach(function (done) {
      context(['src/ya'], function (module) {
        ya = module;
        checkpoint.reset();
        done();
      });
    });

    afterEach(function () {
      ya.clear();
    });

    describe('ya function', function () {

      it('accepts a generator function to be used as task.', function (done) {
        ya(function* () {
          done();
        });
      });

      it('returns a unique task id.', function () {
        var id = ya(function* () {
        });
        expect(id).to.be.a('number');
      });

      it('accepts additional arguments to be passed as arguments for the ' +
         'generator.', function (done) {
        var arg0 = {},
            arg1 = {};
        ya(function* (a, b) {
          a.should.equal(arg0);
          b.should.equal(arg1);
          done();
        }, arg0, arg1);
      });

      it('runs the routine asynchronusly.', function () {
        var spy = sinon.spy();
        ya(function* () {
          spy();
        });
        expect(spy.called).to.be.false;
      });

      it('runs the task until completion.', function (done) {
        var test = '';
        ya(function* () {
          var count = 0;
          while (test.length < 4) { test += count++; yield; }
          expect(test).to.equal('0123');
          done();
        });
      });

      it('runs tasks intercalating the processment (last added task first).',
         function (done) {
        var test = '';
        ya(function* A() {
          while (test.length < 4) {
            test += 'A';
            yield;
          }
        });
        ya(function* B() {
          while (test.length < 4) {
            test += 'B';
            yield;
          }
        });
        ya(function* () {
          while (test.length < 4) { yield; }
          expect(test).to.equal('BABA');
          done();
        });
      });

      it('allows synchronous-like programming by yielding promises.',
          function (done) {

        var count = 0;
        function async() {
          return new Promise(function (fulfill) {
            setTimeout(fulfill.bind(undefined, count++), 200);
          });
        }

        ya(function* () {
          var a = yield async();
          var b = yield async();
          expect(a).to.equal(0);
          expect(b).to.equal(1);
          done();
        });

      });

    });

    describe('ya error handling', function () {
      it('silences the error occurring inside a task and terminates the task.',
         function (done) {
        ya(function* () {
          yield checkpoint(2);
        });

        ya(function* () {
          throw new Error();
        });

        ya(function* () {
          yield checkpoint(1);
          expect(checkpoint.callCount).to.equal(2);
          done();
        });
      });

      it('calls ya.onerror if occurring an error inside some task.',
         function (done) {
        var throwingTask,
            throwingError = new Error();

        ya.onerror = function (executionError) {
          var { taskId, error } = executionError;
          expect(taskId).to.equal(throwingTask);
          expect(error).to.equal(throwingError);
        };

        ya(function* () {
          yield checkpoint(2);
        });

        throwingTask = ya(function* () {
          throw throwingError;
        });

        ya(function* () {
          yield checkpoint(1);
          expect(checkpoint.callCount).to.equal(2);
          done();
        });
      });
    });

    describe('ya.clear() method', function() {
      it('aborts all executions.', function (done) {
        ya(function* () {
          while (true) {
            checkpoint();
            ya.clear();
            yield;
          }
        });
        setTimeout(function () {
          expect(checkpoint.calledOnce).to.be.true;
          done();
        }, 100);
      });
    });

    describe('ya channel instance', function () {

      it('allows coroutine communications.', function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel();
        var expectedMessages = ['A', 'B', 'C'];
        var receivedMessages = [];

        ya(function* consumer() {
          while (receivedMessages.length < expectedMessages.length) {
            var message = yield channel.get();
            receivedMessages.push(message);
          }
          receivedMessages.should.deep.equal(expectedMessages);
          done();
        });

        ya(function* producer(messages) {
          while (messages.length > 0) { yield channel.send(messages.shift()); }
        }, expectedMessages.slice(0));
      });

      it('blocks the sending coroutine until there is a request for the sent ' +
         'data.', function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel();

        ya(function* spy() {
          ya.clear();
          done();
        });

        ya(function* sender() {
          yield channel.send('data');
          expect(true).to.be.false;
        });
      });

      it('blocks the getting coroutine until there are available data.',
         function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel();

        ya(function* spy() {
          ya.clear();
          done();
        });

        ya(function* getter() {
          yield channel.get();
          expect(true).to.be.false;
        });
      });

      it('does not block the sending coroutine until filling all the buffer ' +
         '(unbuffered).', function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel();
        sinon.spy(channel, 'send');

        ya(function* spy() {
          expect(channel.send.callCount).to.equal(1);
          done();
        });

        ya(function* sender() {
          yield channel.send('data');
          expect(true).to.be.false;
        });
      });

      it('does not block the sending coroutine until filling all the buffer ' +
         '(buffered).', function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel(3);

        ya(function* spy() {
          expect(checkpoint.calledOnce).to.be.true;
          done();
        });

        ya(function* sender() {
          yield channel.send('data');
          yield channel.send('more data');
          yield channel.send('more & more data');
          checkpoint(1);

          yield channel.send('and more');
          expect(true).to.be.false;
        });
      });

      it('resumes the sending coroutine as the channel gets empty below its ' +
         'buffered capacity (one task).', function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel(3);

        ya(function* spy() {
          expect(checkpoint.calledOnce).to.be.true;
          expect(checkpoint.getCall(0).args[0]).to.equal(1);
          yield channel.get();
          yield channel.get();
          yield;

          expect(checkpoint.callCount).to.equal(2);
          expect(checkpoint.getCall(0).args[0]).to.equal(1);
          expect(checkpoint.getCall(1).args[0]).to.equal(2);
          done();
        });

        ya(function* sender() {
          yield channel.send('data');
          yield channel.send('more data');
          yield channel.send('more & more data');
          checkpoint(1);

          yield channel.send('and more');
          yield channel.send('and more and more');
          checkpoint(2);
          yield;

          expect(true).to.be.false;
        });
      });

      it('resumes sending coroutines as the channel gets empty below its ' +
         'buffered capacity (two tasks: only one resumes).', function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel(3);

        ya(function* spy() {
          expect(checkpoint.called).to.be.false;

          yield channel.get();
          yield channel.get();
          yield;

          expect(checkpoint.calledOnce);
          expect(checkpoint.getCall(0).args[0]).to.equal(1);
          done();
        });

        ya(function* senderB() {
          yield channel.send('B');
          checkpoint(2);
        });

        ya(function* senderA() {
          yield channel.send('A');
          checkpoint(1);
        });

        ya(function* configure() {
          yield channel.send('data');
          yield channel.send('more data');
          yield channel.send('more & more data');
        });
      });

      it('resumes sending coroutines as the channel gets empty below its ' +
         'buffered capacity (two tasks: both resume).', function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel(3);

        ya(function* spy() {
          expect(checkpoint.called).to.be.false;

          yield channel.get();
          yield channel.get();
          yield;

          expect(checkpoint.callCount).to.equal(2);
          expect(checkpoint.getCall(0).args[0]).to.equal(1);
          expect(checkpoint.getCall(1).args[0]).to.equal(2);
          done();
        });

        ya(function* senderB() {
          yield channel.send('B');
          checkpoint(2);
        });

        ya(function* senderA() {
          yield channel.send('A');
          checkpoint(1);
        });

        ya(function* configure() {
          yield channel.send('data');
          yield channel.send('more data');
          yield channel.send('more & more data');
        });
      });

      it('keeps the order in which the elments have been sent.',
         function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel(3);

        ya(function* () {
          var a = yield channel.get();
          var b = yield channel.get();
          var c = yield channel.get();
          var d = yield channel.get();
          expect(a).to.equal('data');
          expect(b).to.equal('more data');
          expect(c).to.equal('and more data');
          expect(d).to.equal('final data');
          done();
        });

        ya(function* () {
          yield channel.send('and more data');
          yield channel.send('final data');
        });

        ya(function* () {
          yield channel.send('data');
          yield channel.send('more data');
        });
      });
    });

    describe('ya.select() method', function() {

      var realRandom = Math.random;

      afterEach(function () {
        Math.random = realRandom;
      });

      it('accepts sequences of ya.$case() results. Select blocks the routine ' +
         'until one of the cases\' channels is ready (one case).',
         function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channelData, channel = ya.channel();
        var expectedData = {};

        ya(function* () {
          yield channel.send(expectedData); // does not block
        });

        ya(function* () {
          yield ya.select( // it blocks
            ya.$case('get', channel, function (data) {
              channelData = data;
              checkpoint();
            })
          );
          expect(channelData).to.equals(expectedData);
          expect(checkpoint.calledOnce).to.be.true;
          done();
        });
      });

      it('accepts sequences of ya.$case() results. Select blocks the routine ' +
         'until one of the cases\' channels is ready (several cases).',
         function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channelData,
            channelA = ya.channel(),
            channelB = ya.channel();

        var expectedDataB = {};

        ya(function* () {
          yield channelB.send(expectedDataB); // does not block
        });

        ya(function* () {
          yield ya.select( // it blocks
            ya.$case('get', channelA, function (data) {
              channelData = data;
              expect(false).to.be.true;
            }),
            ya.$case('get', channelB, function (data) {
              channelData = data;
              checkpoint();
            })
          );
          expect(channelData).to.equals(expectedDataB);
          expect(checkpoint.calledOnce).to.be.true;
          done();
        });
      });

      it('accepts sequences of ya.$case() results. If more than one channel ' +
         'is ready, one random is selected.',
         function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channelData,
            channelA = ya.channel(),
            channelB = ya.channel();

        var expectedDataA = { data: 'A' },
            expectedDataB = { data: 'B' };

        sinon.stub(Math, 'random').returns(0.75);

        ya(function* () {
          yield channelA.send(expectedDataA); // it blocks
          expect(false).to.be.true;
        });

        ya(function* () {
          yield channelB.send(expectedDataB); // it blocks
          expect(false).to.be.true;
        });

        ya(function* () {
          yield ya.select( // it blocks
            ya.$case('get', channelA, function (data) {
              channelData = data;
              expect(false).to.be.true;
            }),
            ya.$case('get', channelB, function (data) {
              channelData = data;
              checkpoint();
            })
          );
          expect(channelData).to.equals(expectedDataB);
          expect(checkpoint.calledOnce).to.be.true;
          done();
        });
      });

      it('accepts sequences of ya.$case() results. If the channel is ready, ' +
         'routine does not block.', function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channelData, channel = ya.channel(1);
        var expectedData = {};

        ya(function* () {
          expect(false).to.be.true;
        });

        ya(function* () {
          yield channel.send(expectedData); // does not blocks
          yield ya.select( // does not block
            ya.$case('get', channel, function (data) {
              channelData = data;
              checkpoint();
            })
          );
          expect(channelData).to.equals(expectedData);
          expect(checkpoint.calledOnce).to.be.true;
          done();
        });
      });

      it('$case() callbacks are executed just before the routine is resumed.',
         function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel();
        var expectedData = {};

        ya(function* () {
          yield channel.send(expectedData); // does not block
        });

        ya(function* () {
          yield ya.select( // it blocks
            ya.$case('get', channel, function (data) {
              expect(data).to.equals(expectedData);
              done();
            })
          );
          expect(true).to.be.false;
        });
      });

      it('accepts case() clauses with send operations as well: bit pattern ' +
         'test.', function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel();
        var pattern = [1, 0, 0, 0, 1, 0, 0, 1, 0];
        var expectedPattern = pattern.slice(0);
        var receivedData = [];

        Math.random = function () {
          return pattern.shift() ? 0.75 : 0.25;
        };

        ya(function* () {
          while (receivedData.length < expectedPattern.length) {
            var p = yield channel.get();
            receivedData.push(p);
          }
          expect(receivedData).to.deep.equals(expectedPattern);
          done();
        });

        ya(function* () {
          while (true) {
            yield ya.select(
              ya.$case('send', 0, channel),
              ya.$case('send', 1, channel)
            );
          }
        });
      });

      it('accepts $default() clause that prevent select from blocking.',
         function (done) {
        ya.onerror = function (error) { done(error.error); };

        var channel = ya.channel();

        ya(function* () {
          expect(true).to.be.false;
        });

        ya(function* () {
          yield ya.select(
            ya.$case('send', 0, channel),
            ya.$default(function () { checkpoint(); })
          );
          expect(checkpoint.calledOnce).to.be.true;
          done();
        });
      });

    });
  });
});
