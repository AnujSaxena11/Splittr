const nodemailer = require("nodemailer");

let transporter = null;
if(process.env.EMAIL_USER && process.env.EMAIL_PASS){
    transporter = nodemailer.createTransport({
        service: "gmail",
        disableFileAccess: true,
        disableUrlAccess: true,
        auth:{
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

async function sendEmail(to, subject, text){
    if(!transporter){
        const error = new Error("Email service is not configured");
        error.code = "EMAIL_NOT_CONFIGURED";
        throw error;
    }
    try{
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            text,
        });
        console.log("Email Sent");
    }
    catch(e){
        console.error("sendEmail error:", e && e.message ? e.message : e);
        throw e;
    }
}

module.exports = sendEmail;