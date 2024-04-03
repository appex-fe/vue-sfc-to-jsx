class BaseException extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    console.error(this.stack ?? this.message);
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
