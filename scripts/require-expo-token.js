if (!process.env.EXPO_TOKEN) {
  console.error(
    [
      "EXPO_TOKEN não encontrado.",
      "",
      "Crie um token pessoal em:",
      "https://expo.dev/accounts/[seu-usuario]/settings/access-tokens",
      "",
      "Depois crie um arquivo .env na raiz do projeto com:",
      "EXPO_TOKEN=seu_token_aqui",
      "",
      "Use o mesmo usuário que está logado no Expo Go do celular."
    ].join("\n")
  );
  process.exit(1);
}
