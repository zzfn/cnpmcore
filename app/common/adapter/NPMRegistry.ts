import { createWriteStream } from 'fs';
import { mkdir, rm } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import {
  ContextProto,
  AccessLevel,
  Inject,
} from '@eggjs/tegg';
import {
  EggLogger,
  EggContextHttpClient,
  EggAppConfig,
} from 'egg';
import { HttpMethod } from 'urllib';
import dayjs from '../dayjs';

const INSTANCE_NAME = 'npmRegistry';

@ContextProto({
  name: INSTANCE_NAME,
  accessLevel: AccessLevel.PUBLIC,
})
export class NPMRegistry {
  @Inject()
  private readonly logger: EggLogger;
  @Inject()
  private readonly httpclient: EggContextHttpClient;
  @Inject()
  private config: EggAppConfig;
  private timeout = 10000;

  get registry(): string {
    return this.config.cnpmcore.sourceRegistry;
  }

  public async getFullManifests(fullname: string) {
    const url = `${this.registry}/${encodeURIComponent(fullname)}`;
    return await this.request('GET', url);
  }

  public async downloadTarball(tarball: string) {
    const uri = new URL(tarball);
    // will auto clean on CleanTempDir Schedule
    const tmpfile = path.join(this.config.dataDir, 'downloads', dayjs().format('YYYY/MM/DD'),
      `${randomBytes(10).toString('hex')}-${path.basename(uri.pathname)}`);
    await mkdir(path.dirname(tmpfile), { recursive: true });
    const writeStream = createWriteStream(tmpfile);
    try {
      // max 10 mins to download
      // FIXME: should show download progress
      const result = await this.request('GET', tarball, undefined, { timeout: 60000 * 10, writeStream });
      return {
        ...result,
        tmpfile,
      };
    } catch (err) {
      await rm(tmpfile, { force: true });
      throw err;
    }
  }

  // app.put('/:name/sync', sync.sync);
  public async createSyncTask(fullname: string) {
    const url = `${this.registry}/${encodeURIComponent(fullname)}/sync?sync_upstream=true&nodeps=true`;
    // {
    //   ok: true,
    //   logId: logId
    // };
    return await this.request('PUT', url);
  }

  // app.get('/:name/sync/log/:id', sync.getSyncLog);
  public async getSyncTask(fullname: string, id: string, offset: number) {
    const url = `${this.registry}/${encodeURIComponent(fullname)}/sync/log/${id}?offset=${offset}`;
    // { ok: true, syncDone: syncDone, log: log }
    return await this.request('GET', url);
  }

  private async request(method: HttpMethod, url: string, params?: object, options?: object) {
    const res = await this.httpclient.request(url, {
      method,
      data: params,
      dataType: 'json',
      timing: true,
      timeout: this.timeout,
      followRedirect: true,
      ...options,
    });
    this.logger.info('[NPMRegistry:request] %s %s, status: %s', method, url, res.status);
    return {
      method,
      url,
      ...res,
    };
  }
}