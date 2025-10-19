const SupportTicket = require("../models/supportTicket");
const sendEmail = require("../utils/sendemail");

// User creates a ticket
exports.createTicket = async (req, res) => {
  try {
    const { subject, description, Priority } = req.body;

    const ticket = new SupportTicket({
      userId: req.user._id,
      subject,
      description,
      Priority,
    });

    await ticket.save();

    // Send confirmation email to user
    await sendEmail(
      req.user.email,
      "Support Ticket Received",
      `Dear ${req.user.firstName},
       Your complaint titled "${subject}" has been received. We will get back to you shortly regarding your issue.
       Thank you for contacting support.`
    );

    res.status(201).json({ message: "Support ticket created", ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ NEW - Get user's own tickets only
// exports.getMyTickets = async (req, res) => {
//   try {
//     const tickets = await SupportTicket.find({ userId: req.user._id })
//       .populate("userId", "email firstName lastName")
//       .sort({ createdAt: -1 });
//     res.json(tickets);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// Admin gets all tickets
exports.getAllTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find().populate("userId", "email firstName lastName");
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin resolves ticket
exports.resolveTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).populate("userId");

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    ticket.status = "resolved";
    ticket.resolvedAt = new Date();
    ticket.resolvedBy = req.user._id;
    await ticket.save();

    const { customMessage } = req.body;

    if (!customMessage || customMessage.trim() === "") {
      return res.status(400).json({ message: "Custom message is required" });
    }

    await sendEmail(
      ticket.userId.email,
      "Issue Resolved",
      customMessage
    );

    res.status(200).json({ message: "Ticket resolved and email sent successfully" });
  } catch (error) {
    console.error("Error resolving ticket:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};