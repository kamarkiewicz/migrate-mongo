const config = require("./config");

module.exports = {
  async shouldExist() {
    return config.shouldExist();
  },
  async status(db) {
    const { changelogCollectionName } = await config.read();
    const changelogCollection = db.collection(changelogCollectionName);

    return changelogCollection.find({}).toArray();
  },
  async migrated(db, fileName) {
    const { changelogCollectionName } = await config.read();
    const changelogCollection = db.collection(changelogCollectionName);

    const appliedAt = new Date();

    try {
      await changelogCollection.insertOne({ fileName, appliedAt });
    } catch (err) {
      throw new Error(`Could not update changelog: ${err.message}`);
    }
  },
  async downgraded(db, fileName) {
    const { changelogCollectionName } = await config.read();
    const changelogCollection = db.collection(changelogCollectionName);

    try {
      await changelogCollection.deleteOne({ fileName });
    } catch (err) {
      throw new Error(`Could not update changelog: ${err.message}`);
    }
  }
};
