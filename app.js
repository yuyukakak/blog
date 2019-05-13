const querystring = require('querystring')
const handleBlogRouter = require('./src/router/blog')
const handleUserRouter = require('./src/router/user')
const { get , set } = require('./src/db/redis')


const access = require('./src/utils/log')

// session 数据
// const SESSION_DATA = {}

// 获取 cookie 的过期时间
const getCookieExpires = () => {
  const d = new Date()
  d.setTime(d.getTime() + (24 * 60 * 60 * 1000))
  return d.toGMTString()
}

const getPostData  = (req) => {
  return new Promise((resolve, reject) => {
    if (req.method !== 'POST') {
      resolve({})
      return
    }
    if (req.headers['content-type'] !== 'application/json') {
      resolve({})
      return
    }
    let postData = ''
    req.on('data', chunk => {
      postData += chunk.toString()
    })
    req.on('end', () => {
      if (!postData) {
        resolve({})
        return
      }
      resolve(
        JSON.parse(postData)
      )
    })
  })
}

const serverHandle = (req, res) => {

  // 记录 access log
  access(`${req.method} -- ${req.url} -- ${req.headers['user-agent']} -- ${Date.now()}`)
  // 设置返回头
  res.setHeader('Content-type', 'application/json')

  req.path = req.url.split('?')[0]
  
  // 解析path
  req.query = querystring.parse(req.url.split('?')[1])

  // 解析 cookie
  req.cookie = {}
  const cookieStr = req.headers.cookie || ''
  
   cookieStr.split(';').forEach(item => {
     if (!item) {
       return
     }
     const key = item.split('=')[0].trim()
     const value = item.split('=')[1].trim()
     req.cookie[key] = value
   })

   // 解析 session
  //  let needSetCookie = false
  //  let userId = req.cookie.userId
  //  if (userId) {
  //    if (!SESSION_DATA[userId]) {
  //      SESSION_DATA[userId] = {}
  //    }
  //  } else {
  //   needSetCookie = true
  //    userId = `${Date.now()}_${Math.random()}`
  //    SESSION_DATA[userId] = {}
  //  }
  //  req.session = SESSION_DATA[userId]


  // 解析session (使用redis)
  let needSetCookie = false
  let userId = req.cookie.userId
  if (!userId) {
    needSetCookie = true
    userId = `${Date.now()}_${Math.random()}`
    // 初始化 redis 中的seesion值
    set(userId, {})
  }
  // 获取 session
  req.sessionId = userId
  get(req.sessionId).then(sessionData => {
    if (sessionData == null) {
      // 初始化 redis 中的seesion值
      set(req.sessionId, {})
      // 设置 seesion
      req.session = {}
    } else {
      // 设置 session
      req.session = sessionData
    }
    // 处理 post data
    return getPostData(req)
  }).then(postData => {
    req.body = postData
      // 处理blog 路由
    const blogResult = handleBlogRouter(req, res)
    if (blogResult) {
      blogResult.then(blogData => {
          if (needSetCookie) {
            res.setHeader('Set-Cookie', `userId=${userId};path=/;httpOnly;expires=${getCookieExpires()}`)
          }
          res.end(
            JSON.stringify(blogData)
          )
      })
      return
    }
    // 处理user路由
    const userResult = handleUserRouter(req, res)
    if (userResult) {
      userResult.then(userData => {
        if (needSetCookie) {
          res.setHeader('Set-Cookie', `userId=${userId};path=/;httpOnly;expires=${getCookieExpires()}`)
        }
        res.end(
          JSON.stringify(userData)
        )
      })
      return
    }

    // 未命中路由 返回 404
    res.writeHead(404, {"Content-type": "text/plain"})
    res.write('404 Not Found\n')
    res.end()

  })

}

module.exports = serverHandle