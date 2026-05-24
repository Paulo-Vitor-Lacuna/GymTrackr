# GymTrackr

MVP de app de academia em Expo/React Native para registrar treinos, exercícios, carga e repetições sem precisar de MacBook.

## Como rodar sem instalar Node

```bash
docker compose up --build app
```

Depois abra:

- Web: http://localhost:8081

## Como testar fora de casa com Expo Go

Use o tunnel do Expo autenticado para abrir no Expo Go mesmo fora da mesma rede.

1. Crie um Personal access token em:

```text
https://expo.dev/accounts/[seu-usuario]/settings/access-tokens
```

2. Crie um arquivo `.env` na raiz do projeto:

```bash
EXPO_TOKEN=seu_token_aqui
```

Use o mesmo usuário que está logado no Expo Go do celular.

3. Suba o tunnel:

```bash
docker compose up --build mobile-tunnel
```

No iPhone, abra o Expo Go com essa mesma conta. O servidor deve aparecer na lista de development servers; se não aparecer, escaneie o QR Code exibido no terminal.

Se quiser ver os logs/QR de um container que já está rodando:

```bash
docker compose logs -f mobile-tunnel
```

Para imprimir novamente o QR do tunnel já iniciado:

```bash
docker compose exec mobile-tunnel npm run mobile:qr
```

## Testes

```bash
docker compose run --rm test
```

## Escopo do MVP

- Home perguntando qual treino você quer fazer hoje
- Aba de histórico com treinos realizados, séries e volume
- Cadastro de treinos, como Treino A1
- Lista de exercícios dentro de cada treino
- Execução do treino selecionado com carga em kg e repetições por exercício
- Visualização dos exercícios, cargas e repetições dentro de cada treino realizado
- Persistência local no dispositivo/navegador
- Sem autenticação dentro do app por enquanto

## Referências técnicas

- Expo SDK 54: https://expo.dev/changelog/sdk-54
- Expo CLI tunneling: https://docs.expo.dev/more/expo-cli/#tunneling
- Expo access tokens: https://docs.expo.dev/accounts/programmatic-access/
