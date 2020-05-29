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

//Create new playlist
router.post("/create", async (req, res) => {
    var name = req.body.name;
    if (!name || name == '') {
        res.status(400).send("Fill all of the available fields");
    } else {
        const token = req.header("x-auth-token");
        let user = {};
        if (!token || token == '') return res.status(401).send("Token not found");
        try {
            user = jwt.verify(token, "proyek-soa");
        } catch (error) {
            return res.status(401).send("Token invalid");
        }
        const totalPlaylist = await executeQuery(`select * from h_playlist where username='${user.username}'`);
        if (user.type == 0 && totalPlaylist.length >= 2) {
            res.status(400).send("You already have 2 playlist, please upgrade your account");
        } else {
            var id = "PL";
            var num = await executeQuery('select max(substr(id_playlist,3)) as num from h_playlist');
            if (num[0].num == null) id += "001";
            else id += (parseInt(num[0].num) + 1).toString().padStart(3, '0');
            const insert = await executeQuery(`insert into h_playlist values('${id}', '${user.username}', '${name}', 0, now(), now())`);
            res.status(200).send('New playlist created!');
        }
    }
});

//Insert book to playlist
router.post("/insert", async (req, res) => {
    var playlist_id = req.body.playlist_id, book_id = req.body.book_id;
    if (!playlist_id || playlist_id == '' || !book_id || book_id == '') {
        res.status(400).send("Fill all of the available fields");
    } else {
        const token = req.header("x-auth-token");
        let user = {};
        if (!token || token == '') return res.status(401).send("Token not found");
        try {
            user = jwt.verify(token, "proyek-soa");
        } catch (error) {
            return res.status(401).send("Token invalid");
        }
        const playlist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}'`);
        if (playlist.length > 0) {
            const checkPlaylist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}' and username='${user.username}'`);
            if (checkPlaylist.length > 0) {
                const book = await getBook(book_id);
                if (book.error == null) {
                    const checkBook = await executeQuery(`select * from d_playlist where id_playlist='${playlist_id}' and id_book=${book_id}`);
                    if (checkBook.length == 0) {
                        const update = await executeQuery(`update h_playlist set modified_date=now() where id_playlist='${playlist_id}'`);
                        const insert = await executeQuery(`insert into d_playlist values('${playlist_id}', ${book_id})`);
                        res.status(200).send(`Success insert book with id ${book_id} to your playlist`);
                    } else res.status(400).send("This book has already in your playlist");
                } else res.status(404).send("Book not found!");
            } else res.status(400).send("You're not allowed to access this playlist");
        } else res.status(404).send("Playlist not found!");
    }
});

//Show all user's playlist
router.get("/", async (req, res) => {
    const token = req.header("x-auth-token");
    let user = {};
    if (!token || token == '') return res.status(401).send("Token not found");
    try {
        user = jwt.verify(token, "proyek-soa");
    } catch (error) {
        return res.status(401).send("Token invalid");
    }
    const h_playlist = await executeQuery(`select * from h_playlist where username='${user.username}' order by name`);
    if (h_playlist.length > 0) {
        const data_hplaylist = await Promise.all(
            h_playlist.map(async (e1) => {
                const d_playlist = await executeQuery(`select * from d_playlist where id_playlist='${e1.id_playlist}'`);
                const data_dplaylist = await Promise.all(
                    d_playlist.map(async (e2) => {
                        const book = await getBook(e2.id_book);
                        const temp2 = {
                            id:e2.id_book,
                            title:book.GoodreadsResponse.book[0].title[0],
                            year:book.GoodreadsResponse.book[0].publication_year[0],
                            publisher:book.GoodreadsResponse.book[0].publisher[0]
                        }
                        return temp2;
                    })
                );
                const tempDate1 = new Date(e1.created_date);
                const created_date = `${tempDate1.getDate().toString().padStart(2,'0')}/${(tempDate1.getMonth()+1).toString().padStart(2,'0')}/${tempDate1.getFullYear()} ${tempDate1.getHours().toString().padStart(2, '0')}:${tempDate1.getMinutes().toString().padStart(2, '0')}`;
                const tempDate2 = new Date(e1.modified_date);
                const modified_date = `${tempDate2.getDate().toString().padStart(2,'0')}/${(tempDate2.getMonth()+1).toString().padStart(2, '0')}/${tempDate2.getFullYear()} ${tempDate2.getHours().toString().padStart(2, '0')}:${tempDate2.getMinutes().toString().padStart(2, '0')}`;
                const temp1 = {
                    name:e1.name,
                    created_date:created_date,
                    modified_date:modified_date,
                    books:data_dplaylist
                }
                return temp1;
            })
        );
        res.status(200).send(data_hplaylist);
    } else res.status(200).send("Your playlist is empty");
});

//Search all playlist by username
router.get("/search/user/:username", async (req, res) => {
    var username = req.params.username, sort = req.query.sort;
    if (!username || username == '') {
        res.status(400).send("Fill all of the available fields");
    } else {
        const checkUser = await getUser(username);
        if (checkUser.length > 0) {
            let orderby = '';
            if (!sort || sort == '' || sort == 'name') orderby = 'order by name';
            else orderby = 'order by modified_date desc';
            const h_playlist = await executeQuery(`select * from h_playlist where username='${username}' and type=0 ${orderby}`);
            if (h_playlist.length > 0) {
                const data_hplaylist = await Promise.all(
                    h_playlist.map(async (e1) => {
                        const d_playlist = await executeQuery(`select * from d_playlist where id_playlist='${e1.id_playlist}'`);
                        const data_dplaylist = await Promise.all(
                            d_playlist.map(async (e2) => {
                                const book = await getBook(e2.id_book);
                                const temp2 = {
                                    id:e2.id_book,
                                    title:book.GoodreadsResponse.book[0].title[0],
                                    publication_year:book.GoodreadsResponse.book[0].publication_year[0],
                                    publisher:book.GoodreadsResponse.book[0].publisher[0]
                                }
                                return temp2;
                            })
                        );
                        const tempDate1 = new Date(e1.created_date);
                        const created_date = `${tempDate1.getDate().toString().padStart(2,'0')}/${(tempDate1.getMonth()+1).toString().padStart(2,'0')}/${tempDate1.getFullYear()} ${tempDate1.getHours().toString().padStart(2, '0')}:${tempDate1.getMinutes().toString().padStart(2, '0')}`;
                        const tempDate2 = new Date(e1.modified_date);
                        const modified_date = `${tempDate2.getDate().toString().padStart(2,'0')}/${(tempDate2.getMonth()+1).toString().padStart(2, '0')}/${tempDate2.getFullYear()} ${tempDate2.getHours().toString().padStart(2, '0')}:${tempDate2.getMinutes().toString().padStart(2, '0')}`;
                        const temp1 = {
                            name:e1.name,
                            created_date:created_date,
                            modified_date:modified_date,
                            books:data_dplaylist
                        }
                        return temp1;
                    })
                );
                res.status(200).send(data_hplaylist);
            } else res.status(200).send("His/her doesn't has playlist");
        } else res.status(404).send("User not found!");
    }
});

//Search all playlist by name
router.get("/search/name/:name", async (req, res) => {
    var name = req.params.name, sort = req.query.sort;
    if (!name || name == '') {
        res.status(400).send("Fill all of the available fields");
    } else {
        let orderby = '';
        if (!sort || sort == '' || sort == 'name') orderby = 'order by name';
        else orderby = 'order by modified_date desc';
        const h_playlist = await executeQuery(`select * from h_playlist where name like '%${name}%' and type=0 ${orderby}`);
        if (h_playlist.length > 0) {
            const data_hplaylist = await Promise.all(
                h_playlist.map(async (e1) => {
                    const d_playlist = await executeQuery(`select * from d_playlist where id_playlist='${e1.id_playlist}'`);
                    const data_dplaylist = await Promise.all(
                        d_playlist.map(async (e2) => {
                            const book = await getBook(e2.id_book);
                            const temp2 = {
                                id:e2.id_book,
                                title:book.GoodreadsResponse.book[0].title[0],
                                publication_year:book.GoodreadsResponse.book[0].publication_year[0],
                                publisher:book.GoodreadsResponse.book[0].publisher[0]
                            }
                            return temp2;
                        })
                    );
                    const tempDate1 = new Date(e1.created_date);
                    const created_date = `${tempDate1.getDate().toString().padStart(2,'0')}/${(tempDate1.getMonth()+1).toString().padStart(2,'0')}/${tempDate1.getFullYear()} ${tempDate1.getHours().toString().padStart(2, '0')}:${tempDate1.getMinutes().toString().padStart(2, '0')}`;
                    const tempDate2 = new Date(e1.modified_date);
                    const modified_date = `${tempDate2.getDate().toString().padStart(2,'0')}/${(tempDate2.getMonth()+1).toString().padStart(2, '0')}/${tempDate2.getFullYear()} ${tempDate2.getHours().toString().padStart(2, '0')}:${tempDate2.getMinutes().toString().padStart(2, '0')}`;
                    const temp1 = {
                        name:e1.name,
                        created_date:created_date,
                        modified_date:modified_date,
                        books:data_dplaylist
                    }
                    return temp1;
                })
            );
            res.status(200).send(data_hplaylist);
        } else res.status(404).send("Playlist not found!");
    }
});

//Change name of playlist
router.put("/changeName", async (req, res) => {
    var playlist_id = req.body.playlist_id, name = req.body.name;
    if (!playlist_id || playlist_id == '' || !name || name == '') {
        res.status(400).send("Fill all of the available fields");
    } else {
        const token = req.header("x-auth-token");
        let user = {};
        if (!token || token == '') return res.status(401).send("Token not found");
        try {
            user = jwt.verify(token, "proyek-soa");
        } catch (error) {
            return res.status(401).send("Token invalid");
        }
        const playlist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}'`);
        if (playlist.length > 0) {
            const checkPlaylist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}' and username='${user.username}'`);
            if (checkPlaylist.length > 0) {
                const updateName = await executeQuery(`update h_playlist set name='${name}', modified_date=now() where id_playlist='${playlist_id}' and username='${user.username}'`);
                res.status(200).send(`Playlist's name is already change to '${name}'`);
            } else res.status(400).send("You're not allowed to access this playlist");
        } else res.status(404).send("Playlist not found!");
    }
});

//Change playlist privacy
router.put("/changePrivacy", async (req, res) => {
    var playlist_id = req.body.playlist_id;
    if (!playlist_id || playlist_id == '') {
        res.status(400).send("Fill all of the available fields");
    } else {
        const token = req.header("x-auth-token");
        let user = {};
        if (!token || token == '') return res.status(401).send("Token not found");
        try {
            user = jwt.verify(token, "proyek-soa");
        } catch (error) {
            return res.status(401).send("Token invalid");
        }
        if (user.type == 1) {
            const playlist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}'`);
            if (playlist.length > 0) {
                const checkPlaylist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}' and username='${user.username}'`);
                if (checkPlaylist.length > 0) {
                    if (checkPlaylist[0].type == 0) var update = await executeQuery(`update h_playlist set type=1, modified_date=now() where id_playlist='${playlist_id}' and username='${user.username}'`);
                    else var update = await executeQuery(`update h_playlist set type=0, modified_date=now() where id_playlist='${playlist_id}' and username='${user.username}'`);
                    res.status(200).send('Change privacy success!');
                } else res.status(400).send("You're not allowed to access this playlist");
            } else res.status(404).send("Playlist not found!");
        } else res.status(400).send("You're not allowed to access this resource");
    }
});

//Remove book from playlist
router.delete("/delete/book/:book_id", async (req, res) => {
    var playlist_id = req.body.playlist_id, book_id = req.params.book_id;
    if (!playlist_id || playlist_id == '' || !book_id || book_id == '') {
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
        const playlist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}'`);
        if (playlist.length > 0) {
            const checkPlaylist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}' and username='${user.username}'`);
            if (checkPlaylist.length > 0) {
                const checkBook = await executeQuery(`select * from d_playlist where id_playlist='${playlist_id}' and id_book=${book_id}`)
                if (checkBook.length > 0) {
                    const update = await executeQuery(`update h_playlist set modified_date=now() where id_playlist='${playlist_id}'`);
                    const deleteBook = await executeQuery(`delete from d_playlist where id_playlist='${playlist_id}' and id_book=${book_id}`)
                    res.status(200).send(`Book with id ${book_id} has deleted from your playlist`);
                } else res.status(404).send(`Book with id ${book_id} is not in your playlist`);
            } else res.status(400).send("You're not allowed to access this playlist");
        } else res.status(404).send("Playlist not found!");
    }
});

//Remove playlist
router.delete("/delete", async (req, res) => {
    var playlist_id = req.body.playlist_id;
    if (!playlist_id || playlist_id == '') {
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
        const playlist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}'`);
        if (playlist.length > 0) {
            const checkPlaylist = await executeQuery(`select * from h_playlist where id_playlist='${playlist_id}' and username='${user.username}'`);
            if (checkPlaylist.length > 0) {
                const deleteBook = await executeQuery(`delete from d_playlist where id_playlist='${playlist_id}'`);
                const deletePlaylist = await executeQuery(`delete from h_playlist where id_playlist='${playlist_id}'`);
                res.status(200).send(`Playlist with id ${playlist_id} has been deleted`);
            } else res.status(400).send("You're not allowed to access this playlist");
        } else res.status(404).send("Playlist not found!");
    }
});

module.exports = router;