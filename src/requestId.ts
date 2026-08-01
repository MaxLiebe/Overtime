export class RequestIdCounter {
  private value = 0;

  getId(): string {
    const id = this.value;
    this.value += 1;
    return `PsyNetMessage_X_${id}`;
  }
}
