import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="bottom-right" toastOptions={{
          style: { background: "#0D1526", color: "#D8E8FF", border: "1px solid #1C3054", fontFamily: "JetBrains Mono, monospace", fontSize: 13 },
        }} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
