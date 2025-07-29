import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "../utils/supabase";
import { Button } from "../components/ui/button";
import EmailAuthModal from "../components/EmailAuthModal";
import { useAuth } from "../hooks/useAuth";
import Header from "../components/Header";

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  // Get the redirect path from location state, URL params, or default to /account
  const urlParams = new URLSearchParams(window.location.search);
  const returnFromUrl = urlParams.get("returnTo");
  const from =
    returnFromUrl ||
    location.state?.from?.pathname ||
    location.state?.returnTo ||
    "/account";
  const message = location.state?.message;

  // Store the redirect path for the email login flow
  useEffect(() => {
    if (from && from !== "/" && from !== "/account") {
      localStorage.setItem("auth_redirect", from);
    }
  }, [from]);

  // Redirect to original destination once authenticated (handles Google & Email OAuth)
  useEffect(() => {
    if (!loading && isAuthenticated) {
      const authRedirect = localStorage.getItem("auth_redirect");
      if (authRedirect) {
        // Clear redirect and navigate
        localStorage.removeItem("auth_redirect");
        window.location.href = `${window.location.origin}${authRedirect}`;
      } else {
        // Default to account
        window.location.href = `${window.location.origin}/account`;
      }
    }
  }, [loading, isAuthenticated]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="container mx-auto px-4 py-8 flex-1 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md flex flex-col items-center">
          {/* Logo and Site Name */}
          <div className="flex items-end select-none">
            <img
              src="https://imagedelivery.net/nrc8B2Lk8UIoyW7fY8uHVg/757b23a3-9ec0-457d-2634-29e28f03fe00/verysmall"
              alt="Mentra Logo"
            />
          </div>
          <span className="ml-2 font-medium text-lg text-gray-800 mb-6">
            Account
          </span>

          <div className="w-full space-y-4">
            <div className="text-center mb-2">
              <h2 className="text-xl font-semibold">Sign in to continue</h2>
              <p className="text-sm text-gray-500 mt-1">
                Choose your preferred sign in method
              </p>
              {message && (
                <p className="mt-4 text-sm text-blue-600 bg-blue-50 p-3 rounded-md">
                  {message}
                </p>
              )}
            </div>

            {/* Google Sign In Button */}
            <Auth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
                style: {
                  button: {
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: "500",
                  },
                  anchor: {
                    display: "none",
                  },
                  container: {
                    width: "100%",
                  },
                },
                // Only hide specific elements, not the social provider buttons
                className: {
                  message: "hidden",
                  divider: "hidden",
                  label: "hidden",
                  input: "hidden",
                  // Important: We do NOT hide the button class as that would hide the provider buttons
                },
              }}
              providers={["google", "apple"]}
              view="sign_in"
              redirectTo={`${window.location.origin}/login`}
              showLinks={false}
              onlyThirdPartyProviders={true}
            />

            {/* Email Sign In Button */}
            <div className="w-full flex flex-col items-center space-y-4 mt-4">
              <div className="flex items-center w-full">
                <div className="flex-grow h-px bg-gray-300"></div>
                <div className="px-4 text-sm text-gray-500">or</div>
                <div className="flex-grow h-px bg-gray-300"></div>
              </div>

              <Button
                className="w-full py-2"
                onClick={() => setIsEmailModalOpen(true)}
                variant="outline"
              >
                Sign in with Email
              </Button>
            </div>
          </div>

          <div className="text-center text-sm text-gray-500 mt-6">
            <p>
              By signing in, you agree to our Terms of Service and Privacy
              Policy.
            </p>
          </div>

          {/* Email Auth Modal */}
          <EmailAuthModal
            open={isEmailModalOpen}
            onOpenChange={setIsEmailModalOpen}
          />
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
