export type AppRole = "super_admin" | "admin" | "agent";

export interface AuthUser {
  id: string;
  email: string;
  roles: AppRole[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Thrown anywhere in a handler to produce a `{ error }` JSON response. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
