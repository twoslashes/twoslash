// @noErrors

// ✅ Works fine
const a: { test: 'foo' | 'bar' | 'baz' } = {
  test: 'foo'
}
a.t
// ^|

// Expected completion to be "foo", "bar", "baz"
a.test === '
//          ^|

// Expected completion to be "bar", "baz"
a.test === 'b
//           ^|

// Expected completion to be "bar", "baz"
a.test === 'bar'
//           ^|

// Expected completion to be "foo", "bar", "baz"
a.test === 'bar'
//          ^|
