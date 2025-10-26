const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, text,html) => {
  try {
    // const transporter = nodemailer.createTransport({
    //   host: process.env.EMAIL_HOST,
    //   port: process.env.SMTP_PORT,
    //   secure: Number(process.env.SMTP_PORT) === 465, // true only for SSL port
    //   auth: {
    //     user: process.env.EMAIL_USER,
    //     pass: process.env.EMAIL_PASS,
    //   },
    // });

    
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // app password recommended
      },
    });

    const mailOptions = {
      from: `"ShopSmart" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html
    };
  
    // ✅ fire-and-forget — no await so API doesn’t pause
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("❌ Email send failed:", err.message);
      } else {
        console.log("✅ Email sent successfully:", info.response);
      }
    });
  } catch (error) {
    console.error("❌ Email system error:", error.message);
  }
};

module.exports = sendEmail;
