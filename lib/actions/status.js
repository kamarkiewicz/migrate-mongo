const { find } = require("lodash");
const migrationsDir = require("../env/migrationsDir");
const changelog = require("../env/changelog");

module.exports = async db => {
  await migrationsDir.shouldExist();
  await changelog.shouldExist();
  const fileNames = await migrationsDir.getFileNames();
  const entries = await changelog.status(db);

  const statusTable = fileNames.map(fileName => {
    const itemInLog = find(entries, { fileName });
    const appliedAt = itemInLog ? itemInLog.appliedAt.toJSON() : "PENDING";
    return { fileName, appliedAt };
  });

  return statusTable;
};
