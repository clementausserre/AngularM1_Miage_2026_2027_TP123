import { ValidatorFn } from '@angular/forms';

/** bcrypt counts UTF-8 bytes rather than characters. Shared by both forms. */
export const passwordByteLimit: ValidatorFn = control =>
  typeof control.value === 'string' && new TextEncoder().encode(control.value).length <= 72
    ? null : { tooLong: true };
