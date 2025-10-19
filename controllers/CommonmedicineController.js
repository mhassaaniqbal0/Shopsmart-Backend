const CommonMedicine = require("../models/Commonmedicine");

// Add medicine
exports.addMedicine = async (req, res) => {
  try {
    const { title, imageUrl, usage, sideEffect,category ,tags} = req.body;
    const medicine = new CommonMedicine({ title, imageUrl, usage, sideEffect,category,tags});
    await medicine.save();
    res.status(201).json(medicine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update medicine
exports.updateMedicine = async (req, res) => {
  try {
    const { title, imageUrl, usage, sideEffect ,category,tags } = req.body;
    const updatedMedicine = await CommonMedicine.findByIdAndUpdate(
      req.params.id,
      { $set: { title, imageUrl, usage, sideEffect,category,tags } },
      { new: true, runValidators: true }
    );
    if (!updatedMedicine) {
      return res.status(404).json({ error: "Medicine not found" });
    }
    res.json(updatedMedicine);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete medicine
exports.deleteMedicine = async (req, res) => {
  try {
    await CommonMedicine.findByIdAndDelete(req.params.id);
    res.json({ message: "Medicine deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all medicine(admin)
exports.getAllMedicine = async (req, res) => {
  try {
    const medicines = await CommonMedicine.find();
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Get medicine by category (for users)category
exports.getMedicinesByCategory = async (req, res) => {
  try {
    const { category } = req.query;

    const filter = category ? { category: { $regex: category, $options: "i" } } : {};

    const medicines = await CommonMedicine.find(filter);
    res.json(medicines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
