define([], function () {
  'use strict';

  var context = newContext();

  describe('src/ya', function () {

    var ya;
    var checkpoint = sinon.spy();
    var resumed = sinon.spy();

    beforeEach(function (done) {
      context(['src/ya'], function (module) {
        ya = module;
        checkpoint.reset();
        resumed.reset();
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

      it('run the task until completion.', function (done) {
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

    describe('ya.clear() method', function() {
      it('aborts all executions.', function (done) {
        var spy = sinon.spy();
        ya(function* () {
          while (true) {
            spy();
            ya.clear();
            yield;
          }
        });
        setTimeout(function () {
          expect(spy.calledOnce).to.be.true;
          done();
        }, 100);
      });
    });

    describe('ya channel instance', function () {

      it('allows coroutine communications.', function (done) {
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
         'data.',
         function (done) {

        var channel = ya.channel();

        ya(function* spy() {
          ya.clear();
          done();
        });

        ya(function* sender() {
          yield channel.send('data');
          expect(true).to.be.false;
          done();
        });
      });

      it('blocks the getting coroutine until there are available data.',
         function (done) {

        var channel = ya.channel();

        ya(function* spy() {
          ya.clear();
          done();
        });

        ya(function* getter() {
          yield channel.get();
          expect(true).to.be.false;
          done();
        });
      });

      it('does not block the sending coroutine until filling all the buffer ' +
         '(unbuffered).', function (done) {
        var channel = ya.channel();
        sinon.spy(channel, 'send');

        ya(function* spy() {
          expect(channel.send.callCount).to.equal(1);
          done();
        });

        ya(function* sender() {
          yield channel.send('data');
          expect(true).to.be.false;
          done();
        });
      });

      it('does not block the sending coroutine until filling all the buffer ' +
         '(buffered).', function (done) {
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
          done();
        });
      });

      it('resumes the sending coroutine as the channel gets empty below its ' +
         'buffered capacity (one task).', function (done) {
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
          done();
        });
      });

      it('resumes sending coroutines as the channel gets empty below its ' +
         'buffered capacity (two tasks: only one resumes).', function (done) {
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
          checkpoint(1);
        });

        ya(function* () {
          yield channel.send('data');
          yield channel.send('more data');
          yield channel.send('and more data');
          yield channel.send('final data');
          expect(checkpoint.calledOnce).to.be.true;
          done();
        });
      });
    });

  });
});
