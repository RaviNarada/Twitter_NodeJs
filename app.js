const express = require('express')

const path = require('path')

const {open} = require('sqlite')

const sqlite3 = require('sqlite3')

const bcrypt = require('bcrypt')

const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDBAndStartServer = async () => {
  try {
    db = await open({
      filename: dbPath,

      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server Started')
    })
  } catch (e) {
    console.log(`Db  Error :${e.message}`)

    process.exit(1)
  }
}

initializeDBAndStartServer()

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//REgister API 1

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(request.body.password, 10)
  //console.log(username)
  const selectUserQuery = `select * from user where username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser == undefined) {
    const createUserQuuery = `
    insert
     into 
     user(username, password, name, gender)
    values (
      '${username}','${hashedPassword}' ,'${name}','${gender}'
    ) `
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const dbREsponse = await db.run(createUserQuuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//Login API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `
    select * from user where username= '${username}'`
  const dbRes = await db.get(getUserQuery)
  if (dbRes == undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPassRight = await bcrypt.compare(password, dbRes.password)
    if (isPassRight) {
      const payload = {username: username}
      const jwtToken = await jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//Tweets API 3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  let {username} = request
  // console.log(username)
  /* const GetTweetsQuery = `
  select username,tweet,date_time
  from 
  user left join follower on user.user_id = following_user_id	
  where username ='${username}'
  group by tweet_id
  `
  const dbRes = await db.get(GetTweetsQuery)
  response.send(dbRes)*/

  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const userFollowingTweetsQuery = `
  SELECT DISTINCT username,tweet,date_time AS dateTime
  FROM (user INNER JOIN tweet ON user.user_id=tweet.user_id) AS t1  
  INNER JOIN follower ON follower.following_user_id=t1.user_id 
  WHERE t1.user_id IN 
  (SELECT following_user_id FROM follower 
    WHERE follower_user_id=${getUserId.user_id})
    ORDER BY tweet.date_time DESC
    LIMIT 4;`
  const getTweetsFromFollowings = await db.all(userFollowingTweetsQuery)
  response.send(getTweetsFromFollowings)
})

//API 4
app.get('/user/following/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const GetNameQueary = `
  SELECT u.name 
        FROM follower f
        JOIN user u ON f.following_user_id = u.user_id
        WHERE f.follower_user_id = ${getUserId.user_id}
`

  const dbRes = await db.all(GetNameQueary)
  response.send(dbRes)
})

//follows List API 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const GetNameQueary = `
  SELECT u.name ,u.user_id
        FROM follower f
        JOIN user u ON f.follower_user_id = u.user_id
        WHERE f.following_user_id = ${getUserId.user_id}
        
`
  const dbRes = await db.all(GetNameQueary)
  response.send(dbRes)
})

//Tweets API 6
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const {tweetId} = request.params
  const isFollowQuery = `
      SELECT * 
      FROM follower 
      INNER JOIN tweet ON follower.following_user_id=tweet.user_id 
      WHERE tweet.tweet_id=${tweetId} AND follower.follower_user_id=${getUserId.user_id};
    `
  const dbRes = await db.get(isFollowQuery)
  response.send(dbRes)
})

//Get Tweets API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    let {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)
    const {tweetId} = request.params
    const checkFollowingQuery = `
      SELECT *
      FROM follower
      WHERE follower_user_id ='${getUserId.user_id}' AND following_user_id = (
        SELECT user_id FROM tweet WHERE tweet.tweet_id ='${tweetId}'
      );
    `

    const followingResult = await db.get(checkFollowingQuery)

    if (followingResult === undefined) {
      return response.status(401).send('Invalid Request')
    } else {
      const getLikesQuery = `
      SELECT user.username 
      FROM "like"
      JOIN user ON like.user_id = user.user_id
      WHERE like.tweet.id = '${tweetId}';
    `

      const likes = await db.all(getLikesQuery, [tweetId])

      const usernames = likes.map(like => like.username)

      response.status(200).json({likes: usernames})
    }
  },
)

//API 8

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    let {username} = request
    const {tweetId} = request.params
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)

    const checkFollowingQuery = `
      SELECT * 
      FROM follower
      WHERE follower_user_id = '${getUserId}'
      AND following_user_id = (SELECT user_id FROM tweet WHERE tweet_id = '${tweetId}');
    `

    const followingResult = await db.get(checkFollowingQuery)

    if (followingResult === undefined) {
      return response.status(401).send('Invalid Request')
    }

    const getRepliesQuery = `
      SELECT user.name AS name, reply.reply AS reply
      FROM reply
      JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id ='${tweetId}';
    `

    const replies = await db.all(getRepliesQuery, [tweetId])
    response.status(200).json({replies})
  },
)

//Tweets details API 9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const tweetDetailsQuery = `
      SELECT 
        tweet.tweet AS tweet,
        tweet.date_time AS dateTime,
        (SELECT COUNT(like_id) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes,
        (SELECT COUNT(reply_id) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies
      FROM tweet
      WHERE tweet.user_id ='${getUserId}'
      ORDER BY tweet.date_time DESC;
    `
  const dbRes = await db.all(tweetDetailsQuery)
  response.send(dbRes)
})

//Post Tweet API 10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  let {username} = request
  const {tweet} = request.body
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const tweetDetailsQuery = `
  insert into tweet(tweet,user_id,date_time)
  values
  (
    '${tweet}','${getUserId}','2024-10-24 14:50:19'
  )
  `
  const dbRes = await db.run(tweetDetailsQuery)
  response.send('Created a Tweet')
})

//Delete Tweet API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    let {username} = request
    const {tweetId} = request.params
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)
    const isMatchIdQuesry = `
          select * from tweet where tweet.id=${tweetId} AND user.id=${getUserId.user_id}`

    if (isMatchIdQuesry != undefined) {
      const deleteTweetQuery = `
 delete from tweet 
 where tweet_id=${tweetId}`
      const dbRes = await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
