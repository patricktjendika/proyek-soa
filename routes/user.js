const express = require("express"), mysql = require("mysql"), request = require("request"), multer =require('multer'),path = require('path'),jwt = require("jsonwebtoken"),fs = require('fs'),midtransClient = require("midtrans-client"),bodyParser = require('body-parser');
const config = require("../config");

const router = express.Router();
const pool = mysql.createPool(config.database);

router.use(express.static('uploads'));
router.use(bodyParser());

var upload = multer({ dest: 'uploads/' })

var filename="";

let core = new midtransClient.CoreApi({
    isProduction : false,
    serverKey : process.env.SERVERKEY,
    clientKey : process.env.CLIENTKEY
});

let storage = multer.diskStorage({
    destination: function(req, file, callback) {
        callback(null, './uploads')
    },
    filename: function(req, file, callback) {
        filename= filename = Date.now() + path.extname(file.originalname); 
        callback(null,filename)
}
})

function getConnection(){
    return new Promise(function(resolve, reject){
        pool.getConnection(function(err,conn){
            if(err){
                reject(err);
            }else{
                resolve(conn);
            }
        });
    });
}

function executeQuery(conn, query){
    return new Promise(function (resolve, reject){
        conn.query(query, function(err, result){
            if(err){
                reject(err);
            }else{
                resolve(result);
            }
        });
    });
}

//register user
router.post("/register",async(req,res)=>{
    let upload = multer({
        storage: storage,
        fileFilter: function(req, file, callback) {
            let ext = path.extname(file.originalname)
            if (ext !== '.png' && ext !== '.jpg' && ext !== '.gif' && ext !== '.jpeg' && ext !== '.PNG' && ext !== '.JPG' && ext !== '.GIF' && ext !== '.JPEG' ) {
                return callback(res.end('Only images are allowed'), null)
            }
            callback(null, true)
        }
    }).single('profile_picture');

    upload(req, res, async function(err) {
        if(filename==""){
            res.status(400).send("Gambar Tidak Ada");
        }
        else{
            var username = req.body.username;
            var password = req.body.password;
            var name = req.body.name;
            var phone_number = req.body.phone_number;
    
            if(!username){
                res.status(400).send("Username Kosong");
            }else if(!password){
                res.status(400).send("Password Kosong");
            }else if(!name){
                res.status(400).send("name Kosong");
            }else if(!phone_number){
                res.status(400).send("phone number Kosong");
            }else{
                const conn = await getConnection();
                const check = await executeQuery(conn,`select*from user where username='${username}'`);
                if(check.length>0){
                    conn.release();
                    res.status(400).send("Username sudah terpakai");
                }else{
                    const insert = await executeQuery(conn, `insert into user values('${username}','${password}','${name}','${phone_number}',0,'${filename}', 1)`);
                    const insertBookshelf = await executeQuery(conn, `insert into h_bookshelf values('${username}',0)`);
                    conn.release();
                    res.status(200).send("akun "+ username + " berhasil dibuat");
                }
            }
        }
    });
});

//login user
router.post("/login", async(req,res)=>{
    var username = req.body.username;
    var password = req.body.password;

    if(!username){
        res.status(400).send("Username Kosong");
    }else if(!password){
        res.status(400).send("Password Kosong");
    }else{
        const conn = await getConnection();
        const check = await executeQuery(conn,`select * from user where username='${username}' and password='${password}' and status=1`);
        if(check.length>0){
            const token = jwt.sign({    
                "username":check[0].username,
                "password":check[0].password,
                "name":check[0].name,
                "phone_number":check[0].phone_number,
                "type":check[0].type,
                "profile_picture":check[0].profile_picture
            }   ,"proyek-soa");
            conn.release();
            var obj={
                status:200,
                token:token
            };
            res.status(200).send(obj);
        }else{
            conn.release();
            res.status(400).send("akun tidak ditemukan");
        }
    }
});

//update informasi user
router.put("/updateUser/:username", async(req,res)=>{
    var username = req.params.username;
    const token = req.header("x-auth-token");

    let upload = multer({
        storage: storage,
        fileFilter: function(req, file, callback) {
            let ext = path.extname(file.originalname)
            if (ext !== '.png' && ext !== '.jpg' && ext !== '.gif' && ext !== '.jpeg' && ext !== '.PNG' && ext !== '.JPG' && ext !== '.GIF' && ext !== '.JPEG' ) {
                return callback(res.end('Only images are allowed'), null)
            }
            callback(null, true)
        }
    }).single('profile_picture');

    if(!username){
        res.status(400).send("Username Kosong");
    } 
    let user ={};
    if(!token){
        res.status(401).send("Token not found");
    }
    try{
        user = jwt.verify(token,"proyek-soa");
    }catch(err){
        res.status(401).send("Token Invalid");
    }
    if(user.username!=username){
        res.status(404).send("Username Tidak Sesuai Dengan Token");
    }
    upload(req, res, async function(err) {
        if(filename==""){
            filename=user.profile_picture;
        }
        else{
            var password = req.body.password;
            var name = req.body.name;
            var phone_number = req.body.phone_number;
    
            if(!password){
                password=user.password;
            }else if(!name){
                name=user.name;
            }else if(!phone_number){
                phone_number=user.phone_number;
            }else{
                const conn = await getConnection();
                const check = await executeQuery(conn,`select*from user where username='${username}' && password='${user.password}'`);
                if(check.length>0){
                    const update = await executeQuery(conn,`update user set password='${password}', name='${name}', phone_number='${phone_number}',profile_picture='${filename}' where username='${username}'`)
                    conn.release();
                    var obj={
                        message:"Update informasi berhasil",
                        username:username,
                        password:password,
                        name:name,
                        phone_number:phone_number,
                        type:user.type,
                        profile_picture:filename
                    };
                    res.status(200).send(obj);
                }else{
                    conn.release();
                    res.status(400).send("Akun tidak ditemukan");
                }
            }
        }
    });
});

//delete user
router.delete("/:username", async(req,res)=>{
    var username = req.params.username;
    const token = req.header("x-auth-token");

    if(!username){
        res.status(400).send("Username Kosong");
    } 
    let user ={};
    if(!token){
        res.status(401).send("Token not found");
    }
    try{
        user = jwt.verify(token,"proyek-soa");
    }catch(err){
        res.status(401).send("Token Invalid");
    }
    if(user.username!=username){
        res.status(404).send("Username Tidak Sesuai Dengan Token");
    }
    const conn = await getConnection();
    const check = await executeQuery(conn,`select*from user where username='${username}' && password='${user.password}'`);
    if(check.length==0){
        res.status(400).send("Akun tidak ditemukan");
    }else{
        const deleteUser = await executeQuery(conn,`update user set status=0 where username='${username}' && password='${user.password}'`);
        res.status(200).send("Berhasil delete akun "+ username);
    }
    res.status(404).send("Tidak terjadi apa apa");
});

//upgrade
router.put("/upgrade", async(req,res)=>{
    const token = req.header("x-auth-token");

    let user ={};
    if(!token){
        res.status(401).send("Token not found");
    }
    try{
        user = jwt.verify(token,"proyek-soa");
    }catch(err){
        res.status(401).send("Token Invalid");
    }
    const conn = await getConnection();
    const check = await executeQuery(conn,`select*from user where username='${user.username}' && password='${user.password}'`);
    if(check.length>0){
        if(user.type==0){
            if(check[0].transaction_id==""){
                console.log(`- Received charge request for BCA VA`);
                core.charge({
                    "payment_type": "bank_transfer",
                    "transaction_details": {
                    "gross_amount": 200000,
                    "order_id": "order-id-node-"+Math.round((new Date()).getTime() / 1000),
                    },
                    "bank_transfer":{
                    "bank":"bca"
                    },
                    "customer_details":{
                        "first_name":user.name,
                        "phone":user.phone_number
                    }
                })
                .then(async (apiResponse)=>{
                    const addTrans = await executeQuery(conn,`update user set transaction_id='${apiResponse.transaction_id}' where username='${user.username}'`);
                    conn.release();
                    const obj = {
                        "message":"Silahkan membayar di Virtual Number : "+apiResponse.va_numbers[0].va_number,
                        "Nama User":user.name,
                        "transaction_id":apiResponse.transaction_id,
                        "total_price":apiResponse.currency + " " + apiResponse.gross_amount,
                        "payment_type":apiResponse.payment_type,
                        "transaction_time":apiResponse.transaction_time,
                        "transaction_status":apiResponse.transaction_status,
                        "va_numbers":apiResponse.va_numbers
                    }
                    res.status(200).send(obj);
                })
            }else{
                console.log(`- Received check transaction status request:`,check[0].transaction_id);
                core.transaction.status(check[0].transaction_id)
                  .then(async (apiResponse)=>{

                    let transactionStatus = apiResponse.transaction_status;

                    if (transactionStatus == 'capture'){
                        if (fraudStatus == 'challenge'){
                            // TODO set transaction status on your databaase to 'challenge'
                        } else if (fraudStatus == 'accept'){
                            // TODO set transaction status on your databaase to 'success'
                            const obj = {
                                "message":"status pembayaran",
                                "Nama User":user.name,
                                "transaction_id":apiResponse.transaction_id,
                                "total_price":apiResponse.currency + " " + apiResponse.gross_amount,
                                "payment_type":apiResponse.payment_type,
                                "transaction_time":apiResponse.transaction_time,
                                "transaction_status":apiResponse.transaction_status,
                                "va_numbers":apiResponse.va_numbers
                            }
                            const upgradeUser = await executeQuery(conn,`update user set type=1 where username='${user.username}'`);
                            conn.release();
                            res.status(200).send(obj);
                        }
                    } else if (transactionStatus == 'settlement'){
                      // TODO set transaction status on your databaase to 'success'
                      const obj = {
                        "message":"Pembayaran Berhasil",
                        "Nama User":user.name,
                        "transaction_id":apiResponse.transaction_id,
                        "total_price":apiResponse.currency + " " + apiResponse.gross_amount,
                        "payment_type":apiResponse.payment_type,
                        "transaction_time":apiResponse.transaction_time,
                        "transaction_status":apiResponse.transaction_status,
                        "va_numbers":apiResponse.va_numbers
                    }
                    const upgradeUser = await executeQuery(conn,`update user set type=1 where username='${user.username}'`);
                    conn.release();
                    res.status(200).send(obj);
                    } else if (transactionStatus == 'cancel' ||
                      transactionStatus == 'deny' ||
                      transactionStatus == 'expire'){
                      // TODO set transaction status on your databaase to 'failure'
                      const obj = {
                        "message":"Pembayaran Gagal",
                        "Nama User":user.name,
                        "transaction_id":apiResponse.transaction_id,
                        "total_price":apiResponse.currency + " " + apiResponse.gross_amount,
                        "payment_type":apiResponse.payment_type,
                        "transaction_time":apiResponse.transaction_time,
                        "transaction_status":apiResponse.transaction_status,
                        "va_numbers":apiResponse.va_numbers
                    }
                    const removeTrans = await executeQuery(conn,`update user set transaction_id='' where username='${user.username}'`);
                    conn.release();
                    res.status(200).send(obj);
                    } else if (transactionStatus == 'pending'){
                      // TODO set transaction status on your databaase to 'pending' / waiting payment
                      const obj = {
                        "message":"Pembayaran Belum Diterima",
                        "Nama User":user.name,
                        "transaction_id":apiResponse.transaction_id,
                        "total_price":apiResponse.currency + " " + apiResponse.gross_amount,
                        "payment_type":apiResponse.payment_type,
                        "transaction_time":apiResponse.transaction_time,
                        "transaction_status":apiResponse.transaction_status,
                        "va_numbers":apiResponse.va_numbers
                    }
                    conn.release();
                    res.status(200).send(obj);
                    }
                  });
            }          
        }else{
            conn.release();
            res.status(200).send("Akun "+ user.type + " sudah premium");
        }
    }else{
        conn.release();
        res.status(400).send("Akun tidak ditemukan");
    }
});

//notification handler midtrans
router.post("/cekBayar",async(req,res)=>{
    let receivedJson = req.body;
    if(!receivedJson){
        console.log("tidak terjadi apa apa");
        res.status(200).send("tidak terjadi apa apa");
    }else{
        core.transaction.notification(receivedJson)
        .then(async(transactionStatusObject)=>{
        let transaction_id = transactionStatusObject.transaction_id;
        let transactionStatus = transactionStatusObject.transaction_status;
        let fraudStatus = transactionStatusObject.fraud_status;

        if (transactionStatus == 'capture'){
            if (fraudStatus == 'challenge'){
                // TODO set transaction status on your databaase to 'challenge'
            } else if (fraudStatus == 'accept'){
                // TODO set transaction status on your databaase to 'success'
                const conn = await getConnection();
                const upgradeUser = await executeQuery(conn,`update user set type=1 where transaction_id='${transaction_id}'`);
                conn.release();
                console.log("upgrade user");
                res.status(200).send("upgrade user berhasil");
            }
        } else if (transactionStatus == 'settlement'){
            // TODO set transaction status on your databaase to 'success'
            const conn = await getConnection();
            const upgradeUser = await executeQuery(conn,`update user set type=1 where transaction_id='${transaction_id}'`);
            conn.release();
            console.log("upgrade user");
            res.status(200).send("upgrade user berhasil");
        }else{
            console.log("tidak terjadi apa apa");
            res.status(200).send("tidak terjadi apa apa");
        }
        });
    }
});

//get user by keyword
router.get("/:keyword",async(req,res)=>{
    const username = req.params.keyword;

    var users=[];

    if(!username){
        res.status(400).send("Keyword belum diinput");
    }else{
        const conn = await getConnection();
        const search = await executeQuery(conn,`SELECT * FROM user WHERE LOWER(username) LIKE  LOWER('%${username}%') and status=1`);
        if(search.length<=0){
            res.status(404).send("Akun tidak ditemukan");
        }else{
            search.forEach(result => {
                var user={
                    username:result.username,
                    password:result.password,
                    name:result.name,
                    phone_number:result.phone_number,
                    type:result.type,
                    profile_picture:result.profile_picture
                };
                users.push(user);
            });
            var obj={
                message:"Akun berhasil ditemukan",
                users:users
            }
            res.status(200).send(obj);
        }
    }
});

module.exports = router;