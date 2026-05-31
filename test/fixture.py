def add(a, b):
    return a + b


def greet(name):
    return f"Hello, {name}!"


def fail():
    raise ValueError("example failure")


class Counter:
    def __init__(self, initial=0):
        self.value = initial

    def increment(self, amount=1):
        self.value += amount
        return self.value
