# ya!

**ya!** is a [go routine](https://gobyexample.com/goroutine) partial implementation in ES6 using generators and promises in a similar way as [task.js](http://taskjs.org/) operates.

**ya!** is an example library more focused on showing generators applications than on being used in production environments. Nowadays it only works on [browsers supporting ES6 generators](http://kangax.github.io/compat-table/es6/#Generators%20%28yield%29) such as [Mozilla Firefox](https://www.mozilla.org/en-US/firefox/new/).

## Example

Here you have a complete and functional example. For more examples, please read after the sample code.

```javascript
// Make a channel!
var pings = ya.channel();

// Launch a coroutine for producing messages!
ya(function* ping(pings) {
  while (true) {
    yield pings.send('ping ' + Date.now());
  }
});

// Launch a coroutine to stay in the middle o both computations
ya(function* () {
  var count = 1;
  while (true) {
    console.log('In the middle: ' + count++);
    yield;
  }
});

// Launch a coroutine for consuming messages!
ya(function* pong(pings) {
  var msg;
  while (true) {
    msg = yield pings.get();
    console.log(msg);
  }
});
```

Lots of execution examples can be found inside the [`test/spec/ya.js`](https://raw.githubusercontent.com/lodr/ya/master/test/spec/ya.js) file. As the library is growing in maturity, please feel free to open issues on GitHub if you consider the behaviour is not the expected (I'm not a _go guru_ so any feedback is welcome). 

## Documentation

You can find the annotated source on http://rawgit.com/lodr/ya/master/docs/ya.html but here you have the API documentation.

### ya(generator[, ...arguments])

Function `ya()` (which means _now_ in Spanish) is used to start a coroutine. It accepts a generator function and an optional list of arguments that will be passed to the generator when called. `ya()` calls enqueues coroutines in such a way the lastest coroutines are run first. The function returns a positive interger id to uniquely identify the coroutine.

### ya.clear()

Abort **all** the coroutines preventing them for further execution. If `ya.clear()` is called from inside a coroutine, it is not aborted immediately but when reaching the next `yield` or `return`.

### ya.channel([capacity=0])

Returns a new channel. A channel is a way to communicate coroutines sending and asking for values. Coroutines block when sending data until some other coroutine ask for that data. In the same way, coroutine getting data from a channel block until there are some data to be consumed.

If a capacity greater than 0 is provided, the channel is said to be buffered. This allow sending coroutines to not block until enough data is sent to the channel. Precisely the same amount of data indicated by the `capacity` parameter.

### ya.select(ya.$case, [ya.$case | ya.$default]*)

Allow a routine to block on more than one channel operation simultaneously. Operations are declared by calling `ya.$case()` or `ya.$default()` functions imitating the syntax of [go select](https://golang.org/ref/spec#Select_statements). If there are ready channels for the specified operations, one of these operations is randomly choosen and performed. If there is no channel ready, then the function blocks unless a **default** operation has been passed to select. What to do in case of **default** or channel operation is passed as a callback.

**Examples**:

```javascript
// A random bitstream generator
ya(function* bitstream(channel) {
  while (true) {
    yield select(
      ya.$case('send', 0, channel, function () { console.log('Sending 0'); }),
      ya.$case('send', 1, channel, function () { console.log('Sending 1'); })
    );
  }
});

// Non blocking send
ya(function* (channel) {
  var data = {};
  while (true) {
    yield select(
      ya.$case('send', data, channel),
      ya.$default(function () { console.log('Not blocking!') });
    );
  }
});

// Listen for two channels simultaneously
ya(function* (chnA, chnB) {
  while (true) {
    var v;
    yield select(
      ya.$case('get', chnA, function (data) {
        console.log('Received by chnA'); v = data;
      }),
      ya.$case('get', chnB, function (data) {
        console.log('Received by chnB');
        v = data;
      })
    );
    console.log('Data received: ', v);
  }
});
```

#### ya.$case(type[, sendingValue], channel[, callback])

Create a `case` clause with the type of the operation: `get` or `send`, then `sendingValue` for send operations, the targeted `channel` and an optional callback to be executed when the channel is ready and selected by the `ya.select()` function. For the `get` operation, the got value is passed to the callback.

#### ya.$default([callback])

Create a **default clause** to be used as a parameter for `ya.select()` function. If provided and in case of any of the channels is ready, the default's `callback` is called instead.

### channel#get()

Gets a value from the channel. It must be used with `yield` so the coroutine can block if there is no data to be consumed.

### channel#send(data)

Sends data to the channel. For unbuffered channels, a `send()` operation blocks the cororutine until some other process makes a `get()` call to the same channel.

## Installation

Using Bower:

    bower install ya

Or grab the [source](https://raw.githubusercontent.com/lodr/ya/master/dist/ya.js) ([minified](https://raw.githubusercontent.com/lodr/ya/master/dist/ya.min.js)).

## Usage

Include a script tag in your project...

```html
<script href="/path/to/ya.js" type="text/javascript"></script>
```
    
The entry point is the global variable `ya`.

Or load it with [requirejs](http://requirejs.org/):

```javascript
require(['/path/to/ya'], function (ya) { ... });
```
    
### Avoiding collisions

If for some reason you already have a `ya` global variable in your global namespace. You can call `ya.restore()` to get the `ya` function and restore the former value of the `ya` global variable.

```javascript
var myNameForYa = ya.restore();
```
    
## License

MIT. See `LICENSE.txt` in this directory.

## About

A JavaScript library by Salvador de la Puente González.
