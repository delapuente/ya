# ya!

ya! is a [go routine](https://gobyexample.com/goroutine) implementation in ES6 using generators and promises, i.e. tasks.

## Example

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

## API

### ya

ya is the main function (it means _now_ in Spanish) and it's used to start a corotuine.

### channel#get

### channel#set

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

If for some reason you already have a `ya` global variable in your global namespace. You can call `ya.restore()` to get the `ya` function and restore the former value of the `ya` variable.

```javascript
var myNameForYa = ya.restore();
```
    
### Environment requirements


## Documentation


## License

MIT. See `LICENSE.txt` in this directory.

## About

A JavaScript library by Salvador de la Puente González.
