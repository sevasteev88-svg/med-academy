/**
 * Модуль знеособлення даних перед відправкою у зовнішні LLM моделі (п. 1.5).
 *
 * Вимоги безпеки:
 * 1. Прибрати ПІБ (Ім'я, Прізвище) → «Гравець A», «Гравець B»...
 * 2. Прибрати точну дату народження → залишається лише вік (повних років).
 * 3. Прибрати назву клубу → нейтральне «Футбольна Академія».
 * 4. Таблиця відповідності зберігається виключно в пам'яті поточного запиту.
 * 5. Зворотна регідрація (де-анонімізація) тексту відповіді перед відправкою лікарю,
 *    щоб клініцист бачив зрозумілі прізвища у веб-інтерфейсі.
 */

export class Anonymizer {
  private playerToPseudo = new Map<string, string>();
  private pseudoToReal = new Map<string, string>();
  private nextLetterCode = 0;

  // Шаблони назви клубу для видалення
  private clubPatterns: RegExp[] = [
    /ФК\s*[«"']?Чорноморець[»"']?/gi,
    /Чорноморець/gi,
    /ФК\s*[«"']?Черноморец[»"']?/gi,
    /Черноморец/gi,
  ];

  /**
   * Генерує псевдонім виду "Гравець A", "Гравець B", ..., "Гравець AA"...
   */
  private generatePseudonym(): string {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let index = this.nextLetterCode++;
    let result = "";

    while (index >= 0) {
      result = letters[index % 26] + result;
      index = Math.floor(index / 26) - 1;
    }

    return `Гравець ${result}`;
  }

  /**
   * Реєструє гравця в пам'яті запиту та повертає його псевдонім (наприклад, "Гравець A").
   */
  public registerPlayer(fullNameOrLastName: string, firstName?: string): string {
    const full = [fullNameOrLastName, firstName].filter(Boolean).join(" ").trim();
    if (!full) return this.generatePseudonym();

    // Якщо гравець уже зареєстрований у цій сесії
    if (this.playerToPseudo.has(full)) {
      return this.playerToPseudo.get(full)!;
    }

    const pseudo = this.generatePseudonym();
    this.playerToPseudo.set(full, pseudo);
    this.pseudoToReal.set(pseudo, full);

    // Додаємо варіації "Прізвище Ім'я" та "Ім'я Прізвище", а також окремо Прізвище
    const parts = full.split(/\s+/);
    if (parts.length >= 2) {
      const reversed = `${parts[1]} ${parts[0]}`;
      this.playerToPseudo.set(reversed, pseudo);

      // Якщо прізвище довше 3 символів, щоб не замінювати випадкові короткі слова
      if (parts[0].length >= 3) {
        this.playerToPseudo.set(parts[0], pseudo);
      }
      if (parts[1].length >= 3) {
        this.playerToPseudo.set(parts[1], pseudo);
      }
    } else if (full.length >= 3) {
      this.playerToPseudo.set(full, pseudo);
    }

    return pseudo;
  }

  /**
   * Знеособлює довільний текст перед відправкою в ШІ:
   * 1. Замінює назву клубу на «Футбольна Академія».
   * 2. Замінює відомі зареєстровані імена на псевдоніми.
   */
  public anonymizeText(text: string): string {
    if (!text) return "";
    let clean = text;

    // Очищення назви клубу
    for (const pattern of this.clubPatterns) {
      clean = clean.replace(pattern, "Футбольна Академія");
    }

    // Заміна імен на псевдоніми (сортуємо за довжиною спадання, щоб довгі збіги замінювались першими)
    const sortedEntries = Array.from(this.playerToPseudo.entries()).sort(
      (a, b) => b[0].length - a[0].length
    );

    for (const [name, pseudo] of sortedEntries) {
      if (name && name.length >= 3) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        clean = clean.replace(new RegExp(`\\b${escaped}\\b`, "gi"), pseudo);
      }
    }

    return clean;
  }

  /**
   * Зворотне відновлення (регідрація) тексту після відповіді ШІ:
   * Замінює «Гравець A» назад на «Іваненко Петро» для лікаря.
   */
  public restoreText(text: string): string {
    if (!text) return "";
    let restored = text;

    for (const [pseudo, realName] of this.pseudoToReal.entries()) {
      const escaped = pseudo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      restored = restored.replace(new RegExp(escaped, "g"), realName);
    }

    return restored;
  }

  /**
   * Очищає об'єкт контексту гравця від чутливих даних (ПІБ, точна дата народження, клуб),
   * залишаючи лише вік (повних років) та спортивно-медичні параметри.
   */
  public anonymizePlayerContext(player: any): any {
    if (!player) return null;
    const pseudo = this.registerPlayer(
      player.name || player.lastName || `${player.last_name || ""} ${player.first_name || ""}`
    );

    const {
      name,
      first_name,
      last_name,
      date_of_birth,
      team,
      team_name,
      club_id,
      ...safeFields
    } = player;

    return {
      ...safeFields,
      playerPseudonym: pseudo,
      age: player.age,
      position: player.position,
      teamCategory: player.category || "Academy",
    };
  }
}

/**
 * Створює новий екземпляр знеособлювача для ізольованого запиту
 */
export function createAnonymizer(): Anonymizer {
  return new Anonymizer();
}
