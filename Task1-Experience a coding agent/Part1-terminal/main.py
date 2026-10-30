import argparse


def greet(name: str) -> str:
    return f"Hello, {name}!"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Print a greeting.")
    parser.add_argument("--version", action="version", version="1.0")
    parser.add_argument(
        "name",
        nargs="?",
        default="world",
        help="name to greet (default: %(default)s)",
    )
    return parser


if __name__ == "__main__":
    args = build_parser().parse_args()
    print(greet(args.name))
