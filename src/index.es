const generate = require('escodegen').generate;
const exec = require('child_process').exec;
const parse = require('./parser');
const fs = require('fs');

function get(attr) {
  return Function('return ' + attr)();
}

function getAttr(attr) {
  return attr.split('=')[1];
}

function reduceAST(node) {
  const type = node.type;
  const children = node.children;
  const attributes = node.attributes;
  switch (type) {
    case 'source_file':
      return {
        type: 'Program',
        body: children.map(reduceAST)
                      .filter(function(e) { return !!e; })
      };
    case 'func_decl':
      const functionId = get(attributes.shift());
      const paramsNode = children.find((n) => n.type === 'body_params');
      const funcBraceStmt = children.find((n) => n.type === 'brace_stmt');
      return {
        'type': 'FunctionDeclaration',
        'id': {
          'type': 'Identifier',
          'name': functionId.replace(/\(.*\)/g, '')
        },
        'params': reduceAST(paramsNode),
        'body': {
          'type': 'BlockStatement',
          'body': funcBraceStmt.children.map((n) => reduceAST(n))
                                        .filter((n) => !!n)
        }
      }
    case 'body_params':
      return children[0].children
              .map((e) => {
        if (e.type !== 'pattern_typed') throw 'Error parsing parameters';
        return {
           'type': 'Identifier',
           'name': get(e.children.filter((n) => n.type === 'pattern_named')[0].attributes[0])
        }
      });
    case 'top_level_code_decl':
      const braceStatement = children[0];
      if (braceStatement.type !== 'brace_stmt') throw 'Error parsing brace statement';
      return reduceAST(braceStatement.children[0]);
    case 'call_expr':
      const callee = children.find((n) => n.type === 'unresolved_decl_ref_expr')
                           .attributes.find((a) => a.match(/name\=/));
      const tupleExpr = children.find((n) => n.type === 'tuple_expr');
      return {
        'type': 'ExpressionStatement',
        'expression': {
          'type': 'CallExpression',
          'callee': {
            'type': 'Identifier',
            'name': getAttr(callee)
          },
          'arguments': reduceAST(tupleExpr)
        }
      };
    case 'pattern_binding_decl':
      const patternName = get(children[0].attributes[0]);
      const patternValue = get(children[1].attributes.find((a) => a.match(/^value\=/)));

      return {
        'type': 'VariableDeclaration',
        'declarations': [{
          'type': 'VariableDeclarator',
          'id': {
            'type': 'Identifier',
            'name': patternName
          },
          'init': {
            'type': 'Literal',
            'value': patternValue,
            'raw': patternValue.toString()
          }
        }],
        'kind': 'const'
      };
    case 'return_stmt':
      return {
        'type': 'ReturnStatement',
        'argument': reduceAST(children[0])
      };
    case 'sequence_expr':
      const binaryOperatorGenerator = function(expr) {
        const left = expr.shift();
        const leftVal = get(left.attributes.find((a) => a.match(/^value\=/)));
        const op = expr.shift();
        const operator = getAttr(op.attributes.find((a) => a.match(/^name\=/)));
        let right = expr;
        if (right.length > 1) {
          right = binaryOperatorGenerator(right);
        } else {
          const rightVal = get(right.shift().attributes.find((a) => a.match(/^value\=/)));
          right = {
            'type': 'Literal',
            'value': rightVal,
            'raw': rightVal.toString()
          };
        }
        
        return {
          'type': 'BinaryExpression',
          'left': {
            'type': 'Literal',
            'value': leftVal,
            'raw': leftVal.toString()
          },
          'operator': operator,
          'right': right
        };
      }
      return binaryOperatorGenerator(children);
    case 'tuple_expr':
      return children.map((p) => {
        const val = get(p.attributes.find((a) => a.match(/value\=/)));
        return {
          "type": "Literal",
          "value": val,
          "raw": val.toString()
        }
      });
    default:
  }
}

const file = process.argv[2];

exec(`swiftc -dump-parse ${process.argv[2]}`, function(err, stderr, stdout) {
  const sExp = parse(stdout.replace(/\'/g, '"'));
  const ast = reduceAST(sExp);
  fs.writeFile(`${file}.js`, generate(ast));
});
