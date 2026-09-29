import App from "./App.svelte";
import { mount } from "svelte";
import "./app.scss";

mount(App, { target: document.getElementById("app")! });
