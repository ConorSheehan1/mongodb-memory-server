import * as tmp from 'tmp';
import MongoMemoryServer, { MongoMemoryServerStateEnum } from '../MongoMemoryServer';
import { assertion } from '../util/db_util';

tmp.setGracefulCleanup();
jasmine.DEFAULT_TIMEOUT_INTERVAL = 600000;

describe('MongoMemoryServer', () => {
  describe('start()', () => {
    it('should resolve to true if an MongoInstanceData is resolved by _startUpInstance', async () => {
      const mongoServer = new MongoMemoryServer();
      jest
        .spyOn(mongoServer, '_startUpInstance')
        // @ts-expect-error expect an error here rather than an "as any"
        .mockImplementationOnce(() => Promise.resolve({}));

      expect(mongoServer._startUpInstance).not.toHaveBeenCalled();

      await expect(mongoServer.start()).resolves.toEqual(true);

      expect(mongoServer._startUpInstance).toHaveBeenCalledTimes(1);
    });

    it('"_startUpInstance" should use an different port if address is already in use (use same port for 2 servers)', async () => {
      const mongoServer1 = await MongoMemoryServer.create({
        instance: { port: 27444 },
      });

      const mongoServer2 = await MongoMemoryServer.create({
        instance: { port: mongoServer1.getPort() },
      });

      expect(mongoServer1.getInstanceInfo()).toBeDefined();
      expect(mongoServer2.getInstanceInfo()).toBeDefined();
      expect(mongoServer1.getPort()).not.toEqual(mongoServer2.getPort());

      await mongoServer1.stop();
      await mongoServer2.stop();
    });

    it('should throw an error if _startUpInstance throws an unknown error', async () => {
      jest.spyOn(console, 'warn').mockImplementationOnce(() => void 0);

      const mongoServer = new MongoMemoryServer({
        instance: {
          port: 123,
        },
      });

      jest.spyOn(mongoServer, '_startUpInstance').mockRejectedValueOnce(new Error('unknown error'));

      await expect(mongoServer.start()).rejects.toThrow('unknown error');

      expect(mongoServer._startUpInstance).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureInstance()', () => {
    it('should throw an error if no "instanceInfo" is defined after calling start', async () => {
      const mongoServer = new MongoMemoryServer();
      jest.spyOn(mongoServer, 'start').mockImplementationOnce(() => Promise.resolve(true));

      await expect(mongoServer.ensureInstance()).rejects.toThrow(
        'Ensure-Instance failed to start an instance!'
      );

      expect(mongoServer.start).toHaveBeenCalledTimes(1);
    });

    it('should return instanceInfo if already running', async () => {
      const mongoServer = await MongoMemoryServer.create();
      jest.spyOn(mongoServer, 'start'); // so it dosnt count the "start" call inside "create"

      expect(await mongoServer.ensureInstance()).toEqual(mongoServer.getInstanceInfo());
      expect(mongoServer.start).not.toHaveBeenCalled();

      await mongoServer.stop();
    });

    it('should throw an error if "instanceInfo" is undefined but "_state" is "running"', async () => {
      const mongoServer = new MongoMemoryServer();
      mongoServer._state = MongoMemoryServerStateEnum.running;

      try {
        await mongoServer.ensureInstance();
        fail('Expected "ensureInstance" to throw');
      } catch (err) {
        expect(err.message).toEqual(
          'MongoMemoryServer "_state" is "running" but "instanceInfo" is undefined!'
        );
      }
    });

    it('should throw an error if the given "_state" has no case', async () => {
      const mongoServer = new MongoMemoryServer();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      mongoServer._state = 'not Existing';

      try {
        await mongoServer.ensureInstance();
        fail('Expected "ensureInstance" to throw');
      } catch (err) {
        expect(err.message).toEqual('"ensureInstance" does not have an case for "not Existing"');
      }
    });
  });

  describe('stop()', () => {
    it('should start & stop mongod and check output of "getInstanceInfo"', async () => {
      const mongoServer = new MongoMemoryServer({});

      expect(mongoServer.getInstanceInfo()).toBeFalsy();
      mongoServer.start();
      // while mongod launching `getInstanceInfo` is false
      expect(mongoServer.getInstanceInfo()).toBeFalsy(); // isnt this an race-condition?

      // when instance launched then data became avaliable
      await mongoServer.ensureInstance();
      expect(mongoServer.getInstanceInfo()).toBeDefined();

      // after stop, instance data should be empty
      await mongoServer.stop();
      expect(mongoServer.getInstanceInfo()).toBeFalsy();
    });

    it('should return "true" if no instance is running', async () => {
      const mongoServer = new MongoMemoryServer();
      jest.spyOn(mongoServer, 'ensureInstance');

      expect(await mongoServer.stop()).toEqual(true);
      expect(mongoServer.ensureInstance).not.toHaveBeenCalled();
    });
  });

  describe('create()', () => {
    it('should create an instance and call ".start"', async () => {
      jest
        .spyOn(MongoMemoryServer.prototype, 'start')
        .mockImplementationOnce(() => Promise.resolve(true));

      await MongoMemoryServer.create();

      expect(MongoMemoryServer.prototype.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUri()', () => {
    // this is here to not start 2 servers, when only 1 would be enough
    let mongoServer: MongoMemoryServer;
    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create({ instance: { dbName: 'hello' } });
    });
    afterAll(async () => {
      if (mongoServer) {
        await mongoServer.stop();
      }
    });

    it('should return correct value with "otherDb" being a string', async () => {
      const port: number = mongoServer.getPort();
      expect(mongoServer.getUri('customDB')).toEqual(`mongodb://127.0.0.1:${port}/customDB?`);
    });

    it('should return correct value with "otherDb" being a boolean', async () => {
      const port: number = mongoServer.getPort();
      expect(mongoServer.getUri(true)).not.toEqual(`mongodb://127.0.0.1:${port}/hello?`);
    });

    it('should return correct value without "otherDb" being provided', async () => {
      const port: number = mongoServer.getPort();
      assertion(
        mongoServer.instanceInfo,
        new Error('"MongoServer.instanceInfo" should be defined!')
      );
      expect(mongoServer.getUri()).toEqual(
        `mongodb://127.0.0.1:${port}/${mongoServer.instanceInfo.dbName}?`
      );
    });
  });

  it('"getDbPath" should return the dbPath', async () => {
    const tmpDir = tmp.dirSync({ prefix: 'mongo-mem-getDbPath-', unsafeCleanup: true });
    const mongoServer = new MongoMemoryServer({
      instance: { dbPath: tmpDir.name },
    });

    await mongoServer.start();

    expect(mongoServer.getDbPath()).toEqual(tmpDir.name);

    await mongoServer.stop();
    tmpDir.removeCallback();
  });
});
