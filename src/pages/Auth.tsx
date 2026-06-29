import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PhoneCountryInput } from "@/components/ui/phone-country-input";
import { useToast } from "@/hooks/use-toast";
import { isFreeEmailProvider, getEmailDomain } from "@/lib/emailProviders";
import { Loader2, MessageCircle, ArrowLeft, ShieldCheck } from "lucide-react";

type Mode = "signin" | "signup" | "request" | "verify";

// Canonical signup validation rules — kept in sync with the backend.
const signupSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Enter your full name (at least 2 characters).")
    .max(80, "Name must be 80 characters or fewer.")
    .regex(
      /^\p{L}[\p{L} .'-]{1,79}$/u,
      "Name must start with a letter and use only letters, spaces, apostrophes, hyphens, or periods.",
    ),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .max(254, "Email must be 254 characters or fewer.")
    .email("Enter a valid email address.")
    .toLowerCase()
    .refine((value) => !isFreeEmailProvider(value), {
      message:
        "Use your company email address, not a public provider (gmail, yahoo, ...).",
    }),
  company: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters.")
    .max(100, "Company name must be 100 characters or fewer."),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required.")
    .regex(
      /^\+[1-9]\d{6,14}$/,
      "Enter a valid phone number in international format (E.164).",
    ),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(72, "Password must be 72 characters or fewer."),
});

type SignupFieldErrors = Partial<Record<keyof z.infer<typeof signupSchema>, string>>;

export default function Auth() {
  const navigate = useNavigate();
  const { user, signIn, signUp } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("signin");
  const [isLoading, setIsLoading] = useState(false);

  // Sign in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sign up
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupCompany, setSignupCompany] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupErrors, setSignupErrors] = useState<SignupFieldErrors>({});

  // Reset flow
  const [resetEmail, setResetEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (user && (mode === "signin" || mode === "signup")) {
      navigate("/admin");
    }
  }, [user, mode, navigate]);

  // Display-only hint: when the email uses a real (non-free) company domain,
  // surface the domain agents will sign up under. Does not affect the payload.
  const emailDomain = getEmailDomain(signupEmail);
  const companyDomainHint =
    emailDomain && !isFreeEmailProvider(signupEmail) ? emailDomain : null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn(email, password);
      toast({ title: "Welcome back!", description: "You've successfully signed in." });
      navigate("/agent");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to sign in";
      toast({ title: "Sign in failed", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = signupSchema.safeParse({
      full_name: signupName,
      email: signupEmail,
      company: signupCompany,
      phone: signupPhone,
      password: signupPassword,
    });

    if (!result.success) {
      const fieldErrors: SignupFieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof SignupFieldErrors;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setSignupErrors(fieldErrors);
      toast({
        title: "Please fix the highlighted fields",
        description: "Some details need your attention before we can continue.",
        variant: "destructive",
      });
      return;
    }

    setSignupErrors({});
    const { full_name, email: cleanEmail, company, phone, password } = result.data;

    setIsLoading(true);
    try {
      await signUp(cleanEmail, password, full_name, company, phone);
      // No token is issued — the account is pending Super Admin approval.
      // Do NOT navigate; switch back to sign-in and surface a clear success state.
      toast({
        title: "Registration submitted",
        description:
          "Your account is pending Super Admin approval. You can sign in once approved.",
      });
      // Reset the signup fields and return to the sign-in form.
      setSignupPassword("");
      setEmail(signupEmail);
      setMode("signin");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to sign up";
      toast({ title: "Sign up failed", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Self-service password reset is not available on the self-hosted backend.
  // Admins reset passwords from User Management. Direct users to contact their admin.
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Contact your administrator",
      description: "Password resets are handled by an admin. Please reach out to have your password reset.",
    });
  };

  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Contact your administrator",
      description: "Password resets are handled by an admin. Please reach out to have your password reset.",
    });
  };

  return (
    <Layout showFooter={false}>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-gradient-to-br from-background via-secondary/40 to-accent/30">
        <Card className="w-full max-w-md border-border shadow-sm">
          <CardHeader className="text-center">
            <div className="h-12 w-12 rounded-md gradient-primary flex items-center justify-center mx-auto mb-4 shadow-sm">
              <span className="text-primary-foreground font-bold text-lg tracking-tight">CR</span>
            </div>
            {(mode === "signin" || mode === "signup") && (
              <>
                <CardTitle className="text-2xl">
                  {mode === "signin" ? "Sign in" : "Create account"}
                </CardTitle>
                <CardDescription>
                  {mode === "signin"
                    ? "Access your Calls API portal"
                    : "Create your admin account"}
                </CardDescription>
              </>
            )}
            {mode === "request" && (
              <>
                <CardTitle className="text-2xl">Reset password</CardTitle>
                <CardDescription>Enter your email to receive a 6-digit code</CardDescription>
              </>
            )}
            {mode === "verify" && (
              <>
                <CardTitle className="text-2xl">Enter code</CardTitle>
                <CardDescription>
                  We sent a code to <span className="font-medium text-foreground">{resetEmail}</span>
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {(mode === "signin" || mode === "signup") && (
              <div className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-md bg-muted">
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className={`text-sm py-1.5 rounded transition-colors ${
                    mode === "signin"
                      ? "bg-background text-foreground shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className={`text-sm py-1.5 rounded transition-colors ${
                    mode === "signup"
                      ? "bg-background text-foreground shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign up
                </button>
              </div>
            )}

            {mode === "signin" && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(email);
                        setMode("request");
                      }}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            )}

            {mode === "signup" && (
              <form onSubmit={handleSignUp} noValidate className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Jane Doe"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    aria-invalid={!!signupErrors.full_name}
                    required
                  />
                  {signupErrors.full_name && (
                    <p className="text-sm text-destructive mt-1">{signupErrors.full_name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@company.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    aria-invalid={!!signupErrors.email}
                    required
                  />
                  {signupErrors.email && (
                    <p className="text-sm text-destructive mt-1">{signupErrors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-company">Company name</Label>
                  <Input
                    id="signup-company"
                    type="text"
                    placeholder="Acme Inc."
                    value={signupCompany}
                    onChange={(e) => setSignupCompany(e.target.value)}
                    aria-invalid={!!signupErrors.company}
                    required
                  />
                  {companyDomainHint && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Your agents will sign up with @{companyDomainHint} addresses.
                    </p>
                  )}
                  {signupErrors.company && (
                    <p className="text-sm text-destructive mt-1">{signupErrors.company}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-phone">Phone</Label>
                  <PhoneCountryInput
                    id="signup-phone"
                    value={signupPhone}
                    onChange={setSignupPhone}
                  />
                  {signupErrors.phone && (
                    <p className="text-sm text-destructive mt-1">{signupErrors.phone}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    aria-invalid={!!signupErrors.password}
                    required
                  />
                  {signupErrors.password && (
                    <p className="text-sm text-destructive mt-1">{signupErrors.password}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </form>
            )}

            {mode === "request" && (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@example.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send 6-digit code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full gap-2"
                  onClick={() => setMode("signin")}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Button>
              </form>
            )}

            {mode === "verify" && (
              <form onSubmit={handleVerifyAndReset} className="space-y-4">
                <div className="space-y-2">
                  <Label className="block text-center">Verification code</Label>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Verify & set new password
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setMode("request")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ← Change email
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestCode}
                    disabled={isLoading}
                    className="text-primary hover:underline font-medium disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Need an account? Contact us to get started
              </p>
              <Button variant="outline" asChild className="w-full gap-2">
                <a href="https://wa.me/923479973407" target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" />
                  Contact Us on WhatsApp
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
