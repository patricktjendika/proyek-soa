const express = require("express"), cors = require("cors");
const bookshelf = require("./routes/bookshelf");
const review = require("./routes/review");
const bookmark = require("./routes/bookmark");
const user = require("./routes/user.js")
const app = express();

app.use(cors());
app.use(express.urlencoded({extended:true}));
app.use("/bookshelf", bookshelf);
app.use("/review", review);
app.use("/bookmark", bookmark);
app.use("/user",user);


app.get('/showDummies', (req, res) => {
    var arrObj =[{
        Nama: "Budi",
        Umur: "20 Tahun"
    },{
        Nama: "Patrick",
        Umur: "21 Tahun"
    }
    ];
    res.send(arrObj);
});
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Listening on port '+port+'...'));
