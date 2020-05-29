const express = require("express"), mysql = require("mysql"), request = require("request"), xml2js = require("xml2js"), jwt = require("jsonwebtoken");
const parser = new xml2js.Parser();
const config = require("../config");
const router = express.Router();
const conn = mysql.createConnection(config.database);

function getBook(id_book){
    return new Promise(function (resolve,reject){
        var options = {
            'method':'GET',
            'url':`https://www.goodreads.com/book/show.xml?key=${process.env.API_KEY}&id=${id_book}`,
            'headers':{
                'Content-Type':'application/x-www-form-urlencoded'
            }
        };
        request(options,function(error,response){
            if(error) reject(new Error(error));
            else {
                var res;
                parser.parseString(response.body,(err, result)=>{
                    res=result;
                });
                resolve(res);
            }
        });
    });
}

function executeQuery(query) {
    return new Promise((resolve, reject) => {
        conn.query(query, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
}

function getUser(username) {
    return new Promise((resolve, reject) => {
        conn.query(`select * from user where username='${username}' and status=0`, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
}

//Insert book to bookshelf
router.post("/insert", async (req, res) => {
    var book_id = req.body.book_id;
    if (!book_id || book_id == '') {
        res.status(400).send("Fill all of the available fields!");
    } else {
        const token = req.header("x-auth-token");
        let user = {};
        if (!token || token == '') return res.status(401).send("Token not found");
        try {
            user = jwt.verify(token, "proyek-soa");
        } catch (error) {
            return res.status(401).send("Token invalid");
        }
        const book = await getBook(book_id);
        if (book.error == null) {
            const checkBookshelf = await executeQuery(`select * from d_bookshelf where username='${user.username}' and id_book=${book_id}`);
            if (checkBookshelf.length == 0) {
                const insert2Bookshelf = await executeQuery(`insert into d_bookshelf values('${user.username}', ${book_id})`);
                res.status(200).send(`Success insert book with id ${book_id} to your bookshelf!`);
            } else res.status(400).send("This book has already in your bookshelf");
        } else res.status(404).send("Book not found!");
    }
});

//Show user's bookshelf
router.get("/", async (req, res) => {
    const token = req.header("x-auth-token");
    let user = {};
    if (!token || token == '') return res.status(401).send("Token not found");
    try {
        user = jwt.verify(token, "proyek-soa");
    } catch (error) {
        return res.status(401).send("Token invalid");
    }
    const bookshelf = await executeQuery(`select * from d_bookshelf where username='${user.username}'`);
    if (bookshelf.length > 0) {
        const data = await Promise.all(
            bookshelf.map(async (element) => {
                const book = await getBook(element.id_book);
                const temp = {
                    id:element.id_book,
                    title:book.GoodreadsResponse.book[0].title[0],
                    publication_year:book.GoodreadsResponse.book[0].publication_year[0],
                    publisher:book.GoodreadsResponse.book[0].publisher[0]
                }
                return await temp;
            })
        );
        res.status(200).send(data);
    } else res.status(200).send("Your bookshelf is empty");
});

//Search user's bookshelf
router.get("/search/:target", async (req, res) => {
    var usernameTarget = req.params.target;
    if (!usernameTarget || usernameTarget == '') {
        res.status(400).send("Fill all of the available fields");
    } else {
        const checkTarget = await getUser(usernameTarget);
        if (checkTarget.length > 0) {
            const checkPrivacy = await executeQuery(`select type from h_bookshelf where username='${usernameTarget}'`);
            if (checkPrivacy[0].type == 0) {
                const bookshelf = await executeQuery(`select * from d_bookshelf where username='${usernameTarget}'`);
                if (bookshelf.length > 0) {
                    const data = await Promise.all(
                        bookshelf.map(async (element) => {
                            const book = await getBook(element.id_book);
                            const temp = {
                                id:element.id_book,
                                title:book.GoodreadsResponse.book[0].title[0],
                                publication_year:book.GoodreadsResponse.book[0].publication_year[0],
                                publisher:book.GoodreadsResponse.book[0].publisher[0]
                            }
                            return await temp;
                        })
                    );
                    res.status(200).send(data);
                } else res.status(200).send("His/her bookshelf is empty");
            } else res.status(423).send("Sorry, his/her bookshelf is private");
        } else res.status(400).send("Username not found");
    }
});

//Change bookshelf privacy (Premium User)
router.put("/changePrivacy", async (req, res) => {
    const token = req.header("x-auth-token");
    let user = {};
    if (!token || token == '') return res.status(401).send("Token not found");
    try {
        user = jwt.verify(token, "proyek-soa");
    } catch (error) {
        return res.status(401).send("Token invalid");
    }
    if (user.type == 1) {
        const bookshelf = await executeQuery(`select * from h_bookshelf where username='${user.username}'`);
        if (bookshelf[0].type == 0) var update = await executeQuery(`update h_bookshelf set type=1 where username='${user.username}'`);
        else var update = await executeQuery(`update h_bookshelf set type=0 where username='${user.username}'`);
        res.status(200).send('Change privacy success!');
    } else res.status(400).send("You're not allowed to access this resource");
});

//Remove book from bookshelf
router.delete("/delete", async (req, res) => {
    var book_id = req.body.book_id;
    if (!book_id || book_id == '') {
        res.status(400).send('Fill all of the available fields');
    } else {
        const token = req.header("x-auth-token");
        let user = {};
        if (!token || token == '') return res.status(401).send("Token not found");
        try {
            user = jwt.verify(token, "proyek-soa");
        } catch (error) {
            return res.status(401).send("Token invalid");
        }
        const checkBookshelf = await executeQuery(`select * from d_bookshelf where username='${user.username}' and id_book=${book_id}`);
        if (checkBookshelf.length > 0) {
            const deleteBook = await executeQuery(`delete from d_bookshelf where username='${user.username}' and id_book=${book_id}`);
            res.status(200).send(`Book with id ${book_id} has deleted from your bookshelf`);
        } else res.status(400).send(`Book with id ${book_id} is not in your bookshelf`);
    }
});

module.exports = router;