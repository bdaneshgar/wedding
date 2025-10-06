const mongoose = require('mongoose');

const faxScriptSchema = new mongoose.Schema({
  project: { type: String, required: true },
  script: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' } // who saved it
});

const FaxScript = mongoose.model('FaxScript', faxScriptSchema);
module.exports = FaxScript;