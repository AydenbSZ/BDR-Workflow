import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "ADMIN" | "MANAGER" | "TRAINEE";
    };
  }

  interface User {
    role: "ADMIN" | "MANAGER" | "TRAINEE";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "MANAGER" | "TRAINEE";
  }
}
