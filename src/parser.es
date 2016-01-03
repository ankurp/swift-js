const SPACE = /[ \r\n\t]/,
      ATOM  = /[^\r\n\t]/;

function sexp(source) {
  let ix  = 0,
      len = source.length;

  function parseAtom() {
    const start = ix++;
    while (ATOM.test(source[ix]) && 
        (source[ix] !== ')' || 
          (source[ix + 1] && source[ix + 1] === '"'))) {
      ix++;
    }
    const atom = source.substring(start, ix);
    const type = atom.split(' ')[0];
    const attributes = atom.replace(type, '').match(/(?:[^\s"]+|"[^"]*")+/g);
    const node = {
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
    let item   = {};
    while (ix < source.length) {
      const ch = source[ix];
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
