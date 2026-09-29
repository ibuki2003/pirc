import { HttpClient } from "@pirc/api";

// Browser fetch requires its Window receiver; HttpClient invokes its fetcher
// as a method, so passing the bare fetch function would lose that receiver.
export const http = new HttpClient("", (...args) => window.fetch(...args));
