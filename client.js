const net = require('net');
const parser = require('./parser.js');
const render = require('./render.js');
const images = require('images');

class Request {
  // method， url = host + port + path
  // body: k/v
  // headers
  constructor(options) {
    this.method = options.method || "GET";
    this.host = options.host;
    this.port = options.port || 80;
    this.path = options.path || '/'
    this.body = options.body || {};
    this.headers = options.headers || {};
    if (!this.headers["Contnet-Type"]) {
      this.headers["Contnet-Type"] = "application/x-www-form-urlencoded"
    }

    if (this.headers["Contnet-Type"] === 'application/json') {
      this.bodyText = JSON.stringify(this.body)
    } else if (this.headers["Contnet-Type"] === 'application/x-www-form-urlencoded') {
      this.bodyText = Object.keys(this.body).map(key => `${key}=${encodeURIComponent(this.body[key])}`).join('&')
    }

    this.headers["Contnet-Length"] = this.bodyText.length;

  }

  toString() {
    return `${this.method} ${this.path} HTTP/1.1\r
${Object.keys(this.headers).map(key => `${key}: ${this.headers[key]}`).join('\r\n')}\r
\r
${this.bodyText}`
  }

  send(connection) {
    return new Promise((resolve, reject) => {
      const parser = new ResponseParser;
      if (connection) {
        connection.write(this.toString());
      } else {
        connection = net.createConnection({
          host: this.host,
          port: this.port
        }, () => {
          connection.write(this.toString());
        })
        connection.on('data', (data) => {
          parser.receive(data.toString());
          if (parser.isFinished) {
            resolve(parser.response)
          }
          // console.log(parser.statusline);
          // console.log(parser.headers)
          // buffer -> string
          // resolve(data.toString());
          connection.end();
        });
        connection.on('error', (err) => {
          reject(err)
          connection.end()
          console.log(err);
        })
      }
    })
  }
}

class ResponseParser {
  constructor() {
    this.WAITING_STATUS_LINE = 0;
    this.WAITING_STATUS_LINE_END = 1;

    this.WAITING_HEADER_NAME = 2;
    this.WAITING_HEADER_SPACE = 3
    this.WAITING_HEADER_VALUE = 4;
    this.WAITING_HEADER_LINE_END = 5;
    this.WAITING_HEADER_BLICK_END = 6;
    this.WAITING_BODY = 7;

    this.current = this.WAITING_STATUS_LINE;
    this.statusline = '';
    this.headers = {};
    this.headerName = "";
    this.headerValue = "";
    this.bodyParser = null;
  }
  get isFinished() {
    return this.bodyParser && this.bodyParser.isFinished;
  }
  get response() {
    // console.log(this.statusline);
    // console.log(this.bodyParser.content);
    this.statusline.match(/HTTP\/1.1 ([0-9]+) ([\s\S]+)/)
    return {
      statusCode: RegExp.$1,
      statusText: RegExp.$2,
      headers: this.headers,
      body: this.bodyParser.content.join('')
    }
  }
  receive(string) {
    for (let i = 0; i < string.length; i++) {
      this.receiveChar(string.charAt(i));
    }
  }
  receiveChar(char) {
    if (this.current === this.WAITING_STATUS_LINE) {
      if (char === '\r') {
        this.current = this.WAITING_STATUS_LINE_END;
      } else if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME
      } else {
        this.statusline += char;
      }
    } else if (this.current === this.WAITING_STATUS_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME;
      }
    } else if (this.current === this.WAITING_HEADER_NAME) {  // headersName
      // console.log(char);
      if (char === ':') {
        this.current = this.WAITING_HEADER_SPACE;
      } else if (char === '\r') {  // 解析完 headers 后
        this.current = this.WAITING_HEADER_BLICK_END;

        // this.current = this.WAITING_BODY;
        if (this.headers['Transfer-Encoding'] === 'chunked') {
          this.bodyParser = new ThunkedBodyParser()
        }
      } else {
        this.headerName += char;
      }
    } else if (this.current === this.WAITING_HEADER_SPACE) {  // 空行 -> value
      if (char === ' ') {
        this.current = this.WAITING_HEADER_VALUE
      }
    } else if (this.current === this.WAITING_HEADER_VALUE) {
      if (char === '\r') {
        this.current = this.WAITING_HEADER_LINE_END
        this.headers[this.headerName] = this.headerValue;
        this.headerName = ''; // 换行清空 headername、headerValue
        this.headerValue = '';
      } else {
        this.headerValue += char;
      }
    } else if (this.current === this.WAITING_HEADER_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME
      }
    } else if (this.current === this.WAITING_HEADER_BLICK_END) {
      if (char === '\n') {
        this.current = this.WAITING_BODY
      }
    } else if (this.current === this.WAITING_BODY) {
      this.bodyParser.receiveChar(char);
    }

  }
}

class ThunkedBodyParser {
  constructor() {
    this.WAITING_LENGTH = 0;
    this.WAITING_LENGTH_LINE_END = 1;
    this.READING_THUNK = 2;
    this.WAITING_NEW_LINE = 3;
    this.WAITING_NEW_LINE_END = 4;
    this.length = 0;
    this.isFinished = false;
    this.content = [];

    this.current = this.WAITING_LENGTH;
  }
  receiveChar(char) {
    // console.log(JSON.stringify(char))
    // if (!this.isFinished) {
    if (this.current === this.WAITING_LENGTH) {
      if (char === '\r') {
        if (this.length === 0) {
          console.log('/////////////////////');
          // console.log(this.content)
          this.isFinished = true;
        }
        this.current = this.WAITING_LENGTH_LINE_END;
      } else {
        this.length *= 16;
        // this.length += char.charCodeAt(0) - '0'.charCodeAt(0);
        this.length += parseInt(char, 16)
      }
    } else if (this.current === this.WAITING_LENGTH_LINE_END) {
      if (char === '\n') {
        this.current = this.READING_THUNK;
      }
    } else if (this.current === this.READING_THUNK) {
      this.content.push(char)
      this.length--;
      if (this.length === 0) {
        this.current = this.WAITING_NEW_LINE;
      }
    } else if (this.current === this.WAITING_NEW_LINE) {
      if (char === '\r') {
        this.current = this.WAITING_NEW_LINE_END
      }
    } else if (this.current === this.WAITING_NEW_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_LENGTH
      }
    }
    // }
  }
}

void async function () {
  let request = new Request({
    method: "POST",
    host: '127.0.0.1',
    port: 3000,
    path: '/',
    headers: {
      "x-foo2": "test"
    },
    body: {
      name: "chen"
    }
  })

  let response = await request.send();
  console.log(response);

  let dom = parser.parserHTML(response.body);

  console.log('dom---------------------------')
  console.log(dom)

  let viewport = images(800, 600);
  console.log(dom.children[0].children[2].children[1].children[1]);
  render(viewport, dom)

  viewport.save('viewport.jpg');
  // console.log(JSON.stringify(dom));
}();


// const client = net.createConnection({ 
//   port: 3000,
//   host: '127.0.0.1'
// }, () => {
//   // 'connect' 监听器
//   console.log('已连接到服务器');

//   let request = new Request({
//     method: "POST",
//     host: '127.0.0.1',
//     port: 3000,
//     path: '/',
//     headers: {
//       "x-foo2": "test"
//     },
//     body: {
//       name: "chen"
//     }
//   })

//   console.log(request.toString());
//   client.write(request.toString())

//   // 手工发
//   //   client.write(`
//   // POST / HTTP/1.1\r
//   // Contnet-Type: application/x-www-form-urlencoded\r
//   // Contnet-Length: 9\r
//   // \r
//   // name=chen`)
// });
// client.on('data', (data) => {
//   // console.log(data.toString());
//   client.end();
// });
// client.on('end', () => {
//   console.log('已从服务器断开');
// });

// client.on('error', (err) => {
//   console.log(err);
// })