var assert = chai.assert;
var expect = chai.expect;
var should = chai.should();
mocha.setup('bdd');

requirejs.config({ scriptType: 'text/javascript;version=1.8' });

requirejs([
  'spec/ya'
], function () {
  'use strict';
  mocha.run();
});
