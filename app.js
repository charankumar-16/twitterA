const express = require("express");
const path = require("path");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db;

const intializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DBError: ${e.message}`);
    process.exit(1);
  }
};

intializeDBAndServer();

app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const Query = ` SELECT * FROM user WHERE username='${username}' ;`;
  const user = await db.get(Query);

  if (user === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `   
                                 INSERT INTO user(username,password,name,gender)
                                 VALUES 
                                 ('${username}','${hashedPassword}',
                                 '${name}','${gender}') ; `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const Query = ` SELECT * FROM user WHERE username= '${username}' ;`;
  const user = await db.get(Query);
  console.log(user);

  if (user !== undefined) {
    const verifyPassword = await bcrypt.compare(password, user.password);
    if (verifyPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "TOKEN");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API 3

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT * FROM user WHERE username = '${username}' ;`;
  const user = await db.get(query);
  console.log(user);

  const joinTableQuery = ` SELECT user.username,tweet.tweet,tweet.date_time AS dateTime
                             FROM ((user
                              INNER JOIN follower ON follower.following_user_id = user.user_id )
                            INNER JOIN tweet ON tweet.user_id =follower.following_user_id)
                            WHERE follower.follower_user_id=${user.user_id}
                           ORDER BY date_time DESC 
                           LIMIT 4 OFFSET 0 ;`;

  const array = await db.all(joinTableQuery);
  console.log(array);
  response.send(array);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT * FROM user WHERE username = '${username}' ;`;
  const user = await db.get(query);

  const joinTableQuery = ` SELECT (user.name) AS name
                             FROM (user
                              INNER JOIN follower ON follower.following_user_id =user.user_id)
                               WHERE follower.follower_user_id = ${user.user_id}
                              ;`;
  const array = await db.all(joinTableQuery);
  response.send(array);
  // console.log(array);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT * FROM user WHERE username = '${username}' ;`;
  const user = await db.get(query);
  console.log(user);
  const joinTableQuery = ` SELECT  (user.name) AS name
                             FROM (user
                              INNER JOIN follower ON follower.follower_user_id = user.user_id)
                               WHERE follower.following_user_id= ${user.user_id} ;`;
  const array = await db.all(joinTableQuery);
  response.send(array);
  console.log(array);
});
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const query = `SELECT * FROM user WHERE username = '${username}' ;`;
  const user = await db.get(query);
  const tweet = `SELECT tweet.tweet, COUNT(like.like_id) AS likes, 
                COUNT(reply.reply_id) AS replies, 
                tweet.date_time AS dateTime FROM ((tweet   
                INNER JOIN reply ON reply.tweet_id = tweet.tweet_id)
                INNER JOIN like ON like.tweet_id = tweet.tweet_id) 
                INNER JOIN follower ON follower.following_user_id = tweet.user_id
                WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user.user_id} ; `;
  const reply = await db.get(tweet);
  if (reply.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(reply);
  }
  console.log(reply);
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const query = `SELECT * FROM user WHERE username = '${username}' ;`;
    const user = await db.get(query);
    const tweet = ` SELECT user.username FROM
                 ((like   INNER JOIN
                 user ON user.user_id= like.user_id) 
                 INNER JOIN follower ON follower.follower_user_id = user.user_id)
                 WHERE like.tweet_id=${tweetId} AND follower.follower_user_id=${user.user_id};`;
    const reply = await db.all(tweet);
    if (reply.length == 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ likes: reply });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const query = `SELECT * FROM user WHERE username = '${username}' ;`;
    const user = await db.get(query);

    const tweet = ` SELECT user.username AS name, reply.reply  FROM
                 ((reply   INNER JOIN
                 user ON user.user_id= reply.user_id) 
                 INNER JOIN follower ON follower.follower_user_id = user.user_id)
                 WHERE reply.tweet_id=${tweetId} AND follower.follower_user_id=${user.user_id};`;

    const reply = await db.all(tweet);
    console.log(reply);
    if (reply.length == 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: reply });
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query = `SELECT * FROM user WHERE username = '${username}' ;`;
  const user = await db.get(query);

  const tweet = ` SELECT tweet.tweet AS tweet, 
                   COUNT(like.like_id) AS likes, 
                   COUNT(reply.reply_id) AS replies, 
                   tweet.date_time AS dateTime
                  FROM (tweet 
                 INNER JOIN reply 
                 ON reply.tweet_id = tweet.tweet_id )  
                 INNER JOIN like ON like.tweet_id = tweet.tweet_id 
                 WHERE tweet.user_id = ${user.user_id}
                GROUP BY tweet.tweet_id;`;
  const reply = await db.all(tweet);
  console.log(reply);
  response.send(reply);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const query = `SELECT * FROM user WHERE username = '${username}' ;`;
  const user = await db.get(query);

  const createTweet = ` INSERT INTO tweet (tweet,user_id) 
                    VALUES ('${tweet}',${user.user_id}) ; `;
  const reply = await db.run(createTweet);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const query = `SELECT * FROM user WHERE username = '${username}' ;`;
    const user = await db.get(query);

    const checking = ` SELECT * FROM tweet WHERE user_id =${user.user_id} AND tweet_id =${tweetId} ; `;
    const whoseTweet = await db.get(checking);
    if (whoseTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `DELETE FROM tweet 
           WHERE tweet_id = ${tweetId} AND user_id = ${user.user_id} ; `;
      await db.run(deleteQuery);

      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
