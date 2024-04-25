import { logger } from "./logger";

class BaseException extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    logger.error(this.stack ?? this.message);
  }
}

export class FileNotFoundException extends BaseException {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "FileNotFoundException";
  }
}

export class CompilerException extends BaseException {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "CompilerException";
  }
}

export class TransformException extends BaseException {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "TransformException";
  }
}

export class InvalidSchemaException extends BaseException {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "InvalidSchemaException";
  }
}
