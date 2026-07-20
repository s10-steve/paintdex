// Minimal typings for the Google Identity Services browser library
// (https://accounts.google.com/gsi/client), loaded at runtime for the
// "Sign in with Google" ID-token flow. Only the surface we use is declared.
export {};

declare global {
  interface GsiCredentialResponse {
    credential: string;
    select_by?: string;
  }

  interface GsiInitConfig {
    client_id: string;
    callback: (response: GsiCredentialResponse) => void;
    nonce?: string;
    auto_select?: boolean;
    use_fedcm_for_prompt?: boolean;
  }

  interface GsiButtonConfig {
    type?: "standard" | "icon";
    theme?: "outline" | "filled_blue" | "filled_black";
    size?: "small" | "medium" | "large";
    shape?: "rectangular" | "pill" | "circle" | "square";
    text?: "signin_with" | "signup_with" | "continue_with" | "signin";
    logo_alignment?: "left" | "center";
  }

  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GsiInitConfig) => void;
          renderButton: (parent: HTMLElement, options: GsiButtonConfig) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}
