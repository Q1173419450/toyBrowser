const EOF = Symbol('EOF') // EOF: End of File
const css = require('css');

const layout = require('./layout.js')

let currentToken = null;   // 标签
let currentAttribute = null;  // 属性
let currentTextNode = null; // 文本
let rules = [];

let stack = [{ type: 'document', children: [] }]; // 构造 DOM 树

function cssRules(text) {  // 收集rules 规则
  // console.log(text);
  let ast = css.parse(text);
  // console.log(JSON.stringify(ast, null, "     "));
  rules.push(...ast.stylesheet.rules);
}

function match(element, selector) {
  if (!selector || !element.attributes) {
    return false;
  }

  if (selector.charAt(0) == '#') {
    let attr = element.attributes.filter(attr => attr.name === 'id')[0]
    if (attr && attr.value === selector.replace('#', '')) {
      return true;
    }
  } else if (selector.charAt(0) == '.') {
    let attr = element.attributes.filter(attr => attr.name === 'class')[0]
    if (attr && attr.value === selector.replace('.', '')) {
      return true
    }
  } else {
    if (element.tagName === selector) {
      return true
    }
  }
  return false;
}

function specificity(selector) {  // 得到权重
  // 四元组表示优先级
  let p = [0, 0, 0, 0];
  let selectorParts = selector.split('');
  for (let part of selectorParts) {
    // 复合选择器
    if (part.charAt(0) == '#') {
      p[1] += 1;
    } else if (part.charAt(0) == '.') {
      p[2] += 1;
    } else {
      p[3] += 1;
    }
  }
  return p;
}

// 比较四元组
function compare(sp1, sp2) {  // 比较权重
  if (sp1[0] - sp2[0]) {
    return sp1[0] - sp2
  }
  if (sp1[1] - sp2[1]) {
    return sp1[1] - sp2[1]
  }

  if (sp1[2] - sp2[2]) {
    return sp1[2] - sp2[2]
  }

  return sp1[3] - sp2[3];
}

function computeCSS(element) {  // 将rule 应用到 element
  // console.log(rules);
  // console.log("compute CSS for element", element);
  let elements = stack.slice().reverse();

  if (!element.computedStyle) {
    element.computedStyle = {};
  }

  for (let rule of rules) {
    let selectorParts = rule.selectors[0].split(" ").reverse();

    if (!match(element, selectorParts[0])) {
      continue;
    }

    let matched = false;

    let j = 1;
    for (let i = 0; i < elements.length; i++) { // ？
      if (match(elements[i], selectorParts[j])) {
        j++
      }
    }

    if (j >= selectorParts.length) {
      matched = true
    }

    if (matched) {
      // console.log('elements', element, 'matched rule', rule);
      let sp = specificity(rule.selectors[0])
      let computedStyle = element.computedStyle;
      for (let declaration of rule.declarations) {
        if (!computedStyle[declaration.property]) {
          computedStyle[declaration.property] = {}
        }

        if (!computedStyle[declaration.property].specificity) {
          computedStyle[declaration.property].value = declaration.value
          computedStyle[declaration.property].specificity = sp;
        } else if (compare(computedStyle[declaration.property].specificity, sp) < 0) {
          computedStyle[declaration.property].value = declaration.value
          computedStyle[declaration.property].specificity = sp;
        }
      }
      console.log(element.computedStyle);
    }
  }
}


function emit(token) {
  let top = stack[stack.length - 1];

  if (token.type == 'startTag') { //开始标签
    let element = {
      type: 'element',
      children: [],
      attributes: []
    }

    element.tagName = token.tagName;
    for (let p in token) {
      if (p != "type" && p != "tagName") {
        element.attributes.push({
          name: p,
          value: token[p]
        })
      }
    }

    /* 元素创建后 */
    computeCSS(element);

    top.children.push(element)
    element.parent = top

    if (!token.isSelfClosing) {   //自封必标签
      stack.push(element)
    }
    currentTextNode = null;
  } else if (token.type == 'endTag') {  // 结束标签
    if (top.tagName != token.tagName) {
      throw new Error('Tag start end doesn\'t match')
    } else {
      /* 遇到 style 标签时，执行添加 CSS 规则的操作 */
      if (top.tagName === 'style') {
        cssRules(top.children[0].content);
      }

      layout(top);
      stack.pop();
    }
    currentTextNode == null
  } else if (token.type == 'text') {   // 文本节点
    if (currentTextNode == null) {
      currentTextNode = {
        type: 'text',
        content: ''
      }
      top.children.push(currentTextNode);
    }
    currentTextNode.content += token.content;
  }

  // console.log(token)
}

function data(current) {
  if (current === '<') {
    return tagOpen;
  } else if (current == EOF) {
    emit({
      type: 'EOF'
    })
    return;
  } else {
    emit({
      type: 'text',
      content: current
    })
    return data
  }
}

function tagOpen(current) {
  if (current === '/') {  // 结束标签
    return endTagOpen;
  } else if (current.match(/^[a-zA-Z]$/)) {
    currentToken = {
      type: 'startTag',
      tagName: ''
    }
    return tagName(current) // reconsume 将当前词传到下一个状态
  } else {
    emit({
      type: 'text',
      content: current
    })
    return;
  }
}

function endTagOpen(current) {
  if (current.match(/^[a-zA-Z]$/)) {
    currentToken = {
      type: 'endTag',
      tagName: ''
    }
    return tagName(current)
  } else if (current == '>') {
    return data;
  } else if (current == EOF) {
    return;
  } else {
    return;
  }
}

/* 标签名 */
function tagName(current) {
  if (current.match(/^[\t\n\f ]$/)) {
    return beforeAttributeName;
  } else if (current == '/') {
    return selfClosingStartTag;
  } else if (current.match(/^[a-zA-Z]$/)) {
    currentToken.tagName += current//.toLowerCase();
    return tagName
  } else if (current == '>') {
    emit(currentToken)
    return data
  } else {
    return tagName
  }
}

function beforeAttributeName(current) {
  if (current.match(/^[\t\n\f ]$/)) {
    return beforeAttributeName;
  } else if (current == '>' || current == '/' || current == EOF) {
    return afterAttributeName(current)
  } else if (current == '=') {
  } else {
    currentAttribute = {
      name: '',
      value: ''
    }
    return attributeName(current)
  }
}

function attributeName(current) {
  if (current.match(/^[\t\n\f]$/) || current == '/' || current == '>' || current == EOF) {
    return attributeName(current)
  } else if (current == '=') {
    return beforeAttributeValue;
  } else if (current == '\u0000') {

  } else if (current == "\"" || current == "'" || current == "<") {

  } else {
    currentAttribute.name += current;
    return attributeName
  }
}

function beforeAttributeValue(current) {
  if (current.match(/^[\t\n\f ]$/) || current == '/' || current == '>' || current == EOF) {
    return beforeAttributeValue;
  } else if (current == '\"') {
    return doubleQuotedAttributeValue;
  } else if (current == '\'') {
    return singleQuotedAttributeValue;
  } else if (current == '>') {
    return data;
  } else {
    return UnquotedAttributeValue(current);
  }
}

function doubleQuotedAttributeValue(current) {
  if (current == '\"') {
    currentToken[currentAttribute.name] = currentAttribute.value;
    return afterQuotedAttributeValue;
  } else if (current == '\u0000') {

  } else if (current == EOF) {

  } else {
    currentAttribute.value += current;
    return doubleQuotedAttributeValue
  }
}

function singleQuotedAttributeValue(current) {
  if (current == '\'') {
    currentToken[currentAttribute.name] = currentAttribute.value;
    return afterQuotedAttributeValue;
  } else if (current == '\u0000') {

  } else if (current == EOF) {

  } else {
    currentAttribute.value += current;
    return singleQuotedAttributeValue
  }
}

function afterAttributeName(current) {
  if (current.match(/^[\t\n\f]$/)) {
    return beforeAttributeName;
  } else if (current == '/') {
    return selfClosingStartTag
  } else if (current == '>') {
    currentToken[currentAttribute.name] = currentAttribute.value;
    emit(currentToken);
    return data;
  } else if (current == '=') {
    return beforeAttributeValue
  } else if (current == EOF) {

  } else {
    currentToken[currentAttribute.name] = currentAttribute.value;
    currentAttribute = {
      name: '',
      value: ''
    }
    return attributeName(current)
  }
}

function afterQuotedAttributeValue(current) {
  if (current.match(/^[\t\n\f ]$/)) {
    return beforeAttributeName;
  } else if (current == '/') {
    return selfClosingStartTag
  } else if (current == '>') {
    currentToken[currentAttribute.name] = currentAttribute.value;
    emit(currentToken);
    return data;
  } else if (current == EOF) {

  } else {
    currentAttribute.value += current;
    return doubleQuotedAttributeValue
  }
}

function UnquotedAttributeValue(current) {
  if (current.match(/^[\t\n\f]$/)) {
    currentToken[currentAttribute.name] = currentAttribute.value;
    return beforeAttributeName;
  } else if (current == '/') {
    currentToken[currentAttribute.name] = currentAttribute.value;
    return selfClosingStartTag;
  } else if (current == '>') {
    currentToken[currentAttribute.name] = currentAttribute.value;
    emit(currentToken)
    return data;
  } else if (current == '\u0000') {

  } else if (current == '\"' || current == '\'' || current == '<' || current == '=' || current == "`") {

  } else if (current == EOF) {

  } else {
    currentAttribute.value += current;
    return UnquotedAttributeValue
  }
}

function selfClosingStartTag(current) {
  if (current == '>') {
    currentToken.isSelfClosing = true;
    emit(currentToken)
    return data
  } else if (current == EOF) {

  } else {

  }
}

module.exports.parserHTML = function parserHTML(html) {
  let state = data;
  for (let current of html) {
    state = state(current)
  }
  // 标识文件结束
  state = state(EOF);

  return stack[0]

  // console.log(stack[0])
}