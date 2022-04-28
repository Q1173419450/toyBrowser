const http = require('http')

const server = http.createServer((req, res) => {
    console.log(req.headers);
    res.setHeader('Content-Type', 'text/html')
    res.setHeader('X-Foo', 'bar')
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <style>
        #container {
            width: 500px;
            height: 300px;
            display: flex;
            justifyContent: center;
            alignItems: center;
            background-color: rgb(255, 255, 255)
        }

        #container #myid {
            width: 200px;
            height: 100px;
            background-color: rgb(255, 0, 0)
        }

        #container .c1 {
            flex: 1;
            height: 100px;
            background-color: rgb(0, 255, 0)
        }
    </style>
</head>

<body>
    <div id="container">
        <div id="myid"></div>
        <div class="c1"></div>
    </div>
</body></html>`)
}).listen(3000, () => {
    console.log('链接 3000 成功');
})

//   res.end(`<html maaa=a>
// <head>
//   <style>
//     body div #myid{
//       width: 100px;
//       background-color: #ff5000;
//     }
//     body div img{
//       width: 30px;
//       background-color: #ff1111;
//     }
//   </style>
// </head>
// <body>
//     <div>
//       <img id="myid"/>
//       <img />
//     </div>
// </body>`)