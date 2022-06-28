all:	build install

schema:
	glib-compile-schemas schemas/

translation:
	xgettext --from-code=UTF-8 --output=po/ideapad.pot *.js

build:
	gnome-extensions pack -f --extra-source=LICENSE . --out-dir=./

install:
	gnome-extensions install --force ./ideapad@laurento.frittella.shell-extension.zip
