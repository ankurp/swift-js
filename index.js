var generate = require('escodegen').generate;
var exec = require('child_process').exec;
var parse = require('./parser');
var fs = require('fs');

function get(attr) {
  return Function('return ' + attr)();
}

function getAttr(attr) {
  return attr.split('=')[1];
}

function reduceAST(node) {
  var type = node.type;
  var children = node.children;
  var attributes = node.attributes;
  switch (type) {
    case 'source_file':
      return {
        type: 'Program',
        body: children.map(reduceAST)
                      .filter(function(e) { return !!e; })
      };
    case 'func_decl':
      var functionId = get(attributes.shift());
      var paramsNode = children.find((n) => n.type === 'body_params');
      var funcBraceStmt = children.find((n) => n.type === 'brace_stmt');
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
      var braceStatement = children[0];
      if (braceStatement.type !== 'brace_stmt') throw 'Error parsing brace statement';
      return reduceAST(braceStatement.children[0]);
    case 'call_expr':
      var callee = children.find((n) => n.type === 'unresolved_decl_ref_expr')
                           .attributes.find((a) => a.match(/name\=/));
      var tupleExpr = children.find((n) => n.type === 'tuple_expr');
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
      var patternName = get(children[0].attributes[0]);
      var patternValue = get(children[1].attributes.find((a) => a.match(/^value\=/)));

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
        'kind': 'var'
      };
    case 'return_stmt':
      return {
        'type': 'ReturnStatement',
        'argument': reduceAST(children[0])
      };
    case 'sequence_expr':
      var binaryOperatorGenerator = function(expr) {
        var left = expr.shift();
        var leftVal = get(left.attributes.find((a) => a.match(/^value\=/)));
        var op = expr.shift();
        var operator = getAttr(op.attributes.find((a) => a.match(/^name\=/)));
        var right = expr;
        if (right.length > 1) {
          right = binaryOperatorGenerator(right);
        } else {
          var rightVal = get(right.shift().attributes.find((a) => a.match(/^value\=/)));
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
        var val = get(p.attributes.find((a) => a.match(/value\=/)));
        return {
          "type": "Literal",
          "value": val,
          "raw": val.toString()
        }
      });
    default:
  }
}

var file = process.argv[2];

exec(`swiftc -dump-parse ${process.argv[2]}`, function(err, stderr, stdout) {
  var sExp = parse(stdout.replace(/\'/g, '"'));
  var ast = reduceAST(sExp);
  fs.writeFile(`${file}.js`, generate(ast));
});
