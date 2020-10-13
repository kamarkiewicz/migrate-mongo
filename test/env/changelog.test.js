const { expect } = require("chai");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

describe("changelog", () => {
  let changelog;
  let changelogCollection;
  let config;
  let db;

  function mockConfig() {
    return {
      shouldExist: sinon.stub().returns(Promise.resolve()),
      read: sinon.stub().returns({ changelogCollectionName: "changelog" })
    };
  }

  function mockDb() {
    const mock = {};
    mock.collection = sinon.stub();
    mock.collection.withArgs("changelog").returns(changelogCollection);
    return mock;
  }

  function mockChangelogCollection() {
    return {
      insertOne: sinon.stub().returns(Promise.resolve()),
      deleteOne: sinon.stub().returns(Promise.resolve()),
      find: sinon.stub().returns({
        toArray: sinon.stub().returns(
          Promise.resolve([
            {
              fileName: "20160509113224-first_migration.js",
              appliedAt: new Date("2016-06-03T20:10:12.123Z")
            },
            {
              fileName: "20160512091701-second_migration.js",
              appliedAt: new Date("2016-06-09T20:10:12.123Z")
            }
          ])
        )
      })
    };
  }

  beforeEach(() => {
    changelogCollection = mockChangelogCollection();
    config = mockConfig();
    db = mockDb();
    changelog = proxyquire("../../lib/env/changelog", {
      "./config": config
    });
  });

  describe("shouldExist()", () => {
    it("should not reject with an error if config exists", async () => {
      config.shouldExist.returns(Promise.resolve());
      await changelog.shouldExist();
    });

    it("should yield an error if config does not exist", async () => {
      config.shouldExist.returns(Promise.reject(new Error("It does not exist")));
      try {
        await changelog.shouldExist();
        expect.fail("Error was not thrown");
      } catch (err) {
        expect(err.message).to.equal("It does not exist");
      }
    });
  });

  describe("status(db)", () => {
    it("should get database collection using name from config", async () => {
      await changelog.status(db);
      expect(config.read.called).to.equal(true);
      expect(db.collection.called).to.equal(true);
      expect(db.collection.getCall(0).args).to.deep.equal(["changelog"]);
    });

    it("should fetch the content of the changelog collection", async () => {
      expect(await changelog.status(db)).to.deep.equal([
        {
          fileName: "20160509113224-first_migration.js",
          appliedAt: new Date("2016-06-03T20:10:12.123Z")
        },
        {
          fileName: "20160512091701-second_migration.js",
          appliedAt: new Date("2016-06-09T20:10:12.123Z")
        }
      ]);
      expect(changelogCollection.find.called).to.equal(true);
      expect(changelogCollection.find({}).toArray.called).to.equal(true);      
    });
  });

  describe("migrated(db, fileName)", () => {
    const fileName = "20160513155321-third_migration.js";
    const appliedAt = new Date("2016-06-09T08:07:00.077Z");

    it("should get database collection using name from config", async () => {
      await changelog.migrated(db, fileName);
      expect(config.read.called).to.equal(true);
      expect(db.collection.called).to.equal(true);
      expect(db.collection.getCall(0).args)
        .to.deep.equal(["changelog"]);
    });

    it("should populate the changelog with info about the upgraded migrations", async () => {
      const clock = sinon.useFakeTimers(appliedAt.getTime());
      await changelog.migrated(db, fileName);
      expect(changelogCollection.insertOne.called).to.equal(true);
      expect(changelogCollection.insertOne.callCount).to.equal(1);
      expect(changelogCollection.insertOne.getCall(0).args[0])
        .to.deep.equal({ fileName, appliedAt });
      clock.restore();
    });

    it("should yield errors that occurred when inserting to the changelog collection", async () => {
      changelogCollection.insertOne
        .returns(Promise.reject(new Error("Kernel panic")));
      try {
        await changelog.migrated(db, fileName);
        expect.fail("Error was not thrown");
      } catch (err) {
        expect(err.message).to.equal(
          "Could not update changelog: Kernel panic"
        );
      }
    });
  });

  describe("downgraded(db, fileName)", () => {
    const fileName = "20160512091701-second_migration.js";

    it("should get database collection using name from config", async () => {
      await changelog.downgraded(db, fileName);
      expect(config.read.called).to.equal(true);
      expect(db.collection.called).to.equal(true);
      expect(db.collection.getCall(0).args).to.deep.equal(["changelog"]);
    });

    it("should remove the entry of the downgraded migration from the changelog collection", async () => {
      await changelog.downgraded(db, fileName);
      expect(changelogCollection.deleteOne.called).to.equal(true);
      expect(changelogCollection.deleteOne.callCount).to.equal(1);
    });
  
    it("should yield errors that occurred when deleting from the changelog collection", async () => {
      changelogCollection.deleteOne
        .returns(Promise.reject(new Error("Kernel panic")));
      try {
        await changelog.downgraded(db, fileName);
        expect.fail("Error was not thrown");
      } catch (err) {
        expect(err.message).to.equal(
          "Could not update changelog: Kernel panic"
        );
      }
    });
  });
});
