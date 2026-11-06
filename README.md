# VoxOne Installer

Przeglądarkowe narzędzie do wgrywania firmware'u i zarządzania pamięcią dla projektu VoxOne.

## Jak używać

1. Otwórz opublikowaną stronę instalatora w przeglądarce Chrome lub Edge.
2. Podłącz płytkę VoxOne do komputera przewodem USB.
3. Wybierz profil płytki i wersję firmware'u.
4. Kliknij **Połącz** i wskaż właściwy port szeregowy.
5. Kliknij **Wgraj firmware** i poczekaj na komunikat o zakończeniu operacji.

Instalator pozwala również wykonać pełne kasowanie pamięci flash po połączeniu z płytką.

## Dla deweloperów

Projekt jest statyczną aplikacją internetową wykorzystującą [Web Serial API](https://developer.mozilla.org/docs/Web/API/Web_Serial_API) oraz bibliotekę `esptool-js`. Zawartość aplikacji znajduje się w katalogu `docs`.

Stronę można uruchomić lokalnie za pomocą rozszerzenia Live Server, wskazując katalog `docs`, albo prostego serwera HTTP:

```bash
python3 -m http.server 8000 --directory docs
```

Następnie otwórz `http://localhost:8000` w przeglądarce obsługującej Web Serial. Nie otwieraj pliku `index.html` bezpośrednio z dysku, ponieważ Web Serial wymaga bezpiecznego kontekstu, takiego jak HTTPS lub `localhost`.

## Projekt VoxOne

Kod głównego projektu i dokumentacja sprzętowa są dostępne w repozytorium [pimowo/VoxOne](https://github.com/pimowo/VoxOne).
