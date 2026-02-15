declare global {
  interface GooglePickerBuilder {
    addView: (view: unknown) => GooglePickerBuilder;
    setOAuthToken: (token: string) => GooglePickerBuilder;
    setDeveloperKey: (key: string) => GooglePickerBuilder;
    setCallback: (callback: (data: { action: string; docs?: Array<{ id: string; name: string }> }) => void) => GooglePickerBuilder;
    setOrigin: (origin: string) => GooglePickerBuilder;
    build: () => { setVisible: (value: boolean) => void };
  }

  interface GooglePickerDocsView {
    setIncludeFolders: (value: boolean) => GooglePickerDocsView;
    setSelectFolderEnabled: (value: boolean) => GooglePickerDocsView;
    setMimeTypes: (mimeTypes: string) => GooglePickerDocsView;
  }

  interface Window {
    gapi?: {
      load: (module: string, callback: () => void) => void;
    };
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: (error: unknown) => void;
          }) => {
            requestAccessToken: (options?: { prompt?: "" | "consent" }) => void;
          };
          revoke: (token: string, done?: () => void) => void;
        };
      };
      picker?: {
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        DocsView: new (viewId?: string) => GooglePickerDocsView;
        ViewId: {
          FOLDERS: string;
        };
        PickerBuilder: new () => GooglePickerBuilder;
      };
    };
  }
}

export {};
