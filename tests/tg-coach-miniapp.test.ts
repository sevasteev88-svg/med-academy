import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyTelegramWebAppInitData } from "../src/lib/telegram-webapp-auth.ts";

function buildSignedInitData(userObj: object, botToken: string, authDate: number): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "AAHdF6IQAAAAAN0XohDhrOrc");
  params.set("user", JSON.stringify(userObj));

  const pairs: string[] = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort();

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(pairs.join("\n")).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("Telegram Mini App (WebApp initData) автентифікація тренера", () => {
  const botToken = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

  it("успішно валідує коректно підписаний initData", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = buildSignedInitData({ id: 99887766, first_name: "Іван" }, botToken, now);

    const res = verifyTelegramWebAppInitData(initData, botToken);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.user.id, 99887766);
      assert.equal(res.user.first_name, "Іван");
    }
  });

  it("відхиляє initData з підробленим підписом", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = buildSignedInitData({ id: 99887766, first_name: "Іван" }, "wrong-token", now);

    const res = verifyTelegramWebAppInitData(initData, botToken);
    assert.equal(res.ok, false);
  });

  it("відхиляє прострочений initData (>24 год)", () => {
    const old = Math.floor(Date.now() / 1000) - 90000;
    const initData = buildSignedInitData({ id: 99887766 }, botToken, old);

    const res = verifyTelegramWebAppInitData(initData, botToken);
    assert.equal(res.ok, false);
  });
});
