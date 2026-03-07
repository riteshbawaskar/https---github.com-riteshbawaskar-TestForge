import axios, { AxiosError } from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// Global response error handler — surface backend detail messages
api.interceptors.response.use(
  r => r,
  (err: AxiosError<{ detail?: string }>) => {
    const msg = err.response?.data?.detail ?? err.message ?? "An error occurred";
    return Promise.reject(new Error(msg));
  }
);

export default api;
