var SPACE = /[ \r\n\t]/,
    ATOM  = /[^\r\n]/;

function sexp(source) {
  var ix  = 0,
    len = source.length;

  function parseAtom() {
    var start = ix++;
    while (ATOM.test(source[ix]) && 
        (source[ix] !== ')' || 
          (source[ix + 1] && source[ix + 1] === '"'))) {
      ix++;
    }
    var atom = source.substring(start, ix);
    var type = atom.split(' ')[0];
    var attributes = atom.replace(type, '').match(/(?:[^\s"]+|"[^"]*")+/g);
    var node = {
      type: type,
      children: []
    };
    if (!!attributes) node.attributes = attributes;
    
    return node;
  }

  function parseSexp() {
    while (SPACE.test(source[ix]))
      ix++;
    if (source[ix++] !== '(')
      throw new Error("parse error");
    var item   = {},
        state  = 'out',
        start  = null;
    while (ix < source.length) {
      var ch = source[ix];
      if (ch === ')') {
        ix++;
        return item;
      } else if (ch === '(') {
        item.children.push(parseSexp());
      } else if (SPACE.test(ch)) {
        ix++;
      } else {
        item = parseAtom();
      }
    }
    throw new Error("parse error");
  }
  return parseSexp();
}

module.exports = sexp;
