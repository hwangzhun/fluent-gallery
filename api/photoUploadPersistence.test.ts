// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { forgetPendingUploadJobs, getPendingUploadJobIds, rememberPendingUploadJob } from './photoUploadService';

beforeEach(() => localStorage.clear());

describe('pending upload job persistence', () => {
  it('survives reload-style reads and removes only terminal jobs', () => {
    rememberPendingUploadJob('job-1');
    rememberPendingUploadJob('job-2');
    rememberPendingUploadJob('job-1');
    expect(getPendingUploadJobIds()).toEqual(['job-1', 'job-2']);
    forgetPendingUploadJobs(['job-1']);
    expect(getPendingUploadJobIds()).toEqual(['job-2']);
  });
});
